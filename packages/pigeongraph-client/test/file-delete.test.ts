import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ClientGraphStore } from '../src/store/client-graph.js';
import { DualBufferReconciler } from '../src/reconciler/dual-buffer.js';
import { SuperGraphExploreEngine } from '../src/tools/explore-tool.js';
import type { SuperNode, GraphDeltaEnvelope } from '@pigeongraph/schema';

function makeNode(id: string, name: string, filePath: string, outgoingEdges: SuperNode['substrate']['outgoingEdges'] = []): SuperNode {
  return {
    id,
    urn: `urn:test:${name}`,
    kind: 'function',
    name,
    qualifiedName: name,
    repoId: 'app',
    versioning: {
      lamportClock: 1,
      vectorClock: { daemon: 1 },
      layerEpochs: { substrateEpoch: 1, semanticEpoch: 0, processEpoch: 0 },
      contentSha256: '0'.repeat(64),
      astStructuralHash: '0'.repeat(64),
      semanticValidityHash: '0'.repeat(64),
    },
    substrate: {
      sourceLocation: { filePath, startLine: 1, startColumn: 0, endLine: 10, endColumn: 1 },
      language: 'typescript',
      symbolSignature: `export function ${name}()`,
      outgoingEdges,
      astEpochTimestamp: new Date().toISOString(),
    },
    semantic: { validityStatus: 'VALID', communityClusters: [], semanticEmbeddings: [] },
    processFlow: { isEntryPoint: false, entryPointScore: 0.1, processFlowSequences: [], crossRepoContracts: [] },
  };
}

describe('Task 4.3: FileDelete cascade + epoch tombstone GC', () => {
  test('FileDelete removes all nodes with filePath + incident edges; explore empty/provisional', () => {
    const store = new ClientGraphStore();
    const reconciler = new DualBufferReconciler(store);

    const nodeA = makeNode('sg://app/src/dead.ts#funcA', 'funcA', 'src/dead.ts', [
      { targetId: 'sg://app/src/dead.ts#funcB', kind: 'CALLS', confidence: 'EXTRACTED', confidenceScore: 1.0, provenance: 'tree-sitter-ast' },
    ]);
    const nodeB = makeNode('sg://app/src/dead.ts#funcB', 'funcB', 'src/dead.ts');
    const nodeLive = makeNode('sg://app/src/live.ts#liveFn', 'liveFn', 'src/live.ts');

    const upsert: GraphDeltaEnvelope = {
      protocolVersion: 1,
      epochId: 1,
      transactionId: 'tx-43-upsert',
      vectorClock: { daemon: 1 },
      timestampMs: Date.now(),
      projectRoot: '/test',
      reconcileMode: 'delta',
      mutations: [
        { type: 'NodeUpsert', node: nodeA },
        { type: 'NodeUpsert', node: nodeB },
        { type: 'NodeUpsert', node: nodeLive },
      ],
    };
    const r1 = reconciler.applySubstrateDelta(upsert);
    assert.equal(r1.appliedMutations, 3);
    assert.equal(store.countNodes(), 3);

    const del: GraphDeltaEnvelope = {
      protocolVersion: 1,
      epochId: 2,
      transactionId: 'tx-43-filedelete',
      vectorClock: { daemon: 2 },
      timestampMs: Date.now(),
      projectRoot: '/test',
      reconcileMode: 'delta',
      mutations: [{ type: 'FileDelete', filePath: 'src/dead.ts' }],
    };
    const r2 = reconciler.applySubstrateDelta(del);
    assert.equal(r2.appliedMutations, 1);

    // Deleted file symbols gone; live node survives (no data loss for live nodes).
    assert.equal(store.countNodes(), 1);
    assert.equal(store.getNode(nodeA.id), null);
    assert.equal(store.getNode(nodeB.id), null);
    assert.ok(store.getNode(nodeLive.id));
    assert.equal(store.countEdges(), 0);
    assert.deepEqual(
      store.getAllNodes().map((n) => n.id),
      [nodeLive.id]
    );

    const explore = new SuperGraphExploreEngine(store);
    const res = explore.explore({ query: 'funcA', include_blast_radius: false, include_spans: false });
    assert.equal(res.symbols.length, 0);
    assert.equal(res.query_summary.epistemic_status, 'PROVISIONAL_LOWER_BOUND');
    assert.equal(res.query_summary.resolved_anchor, undefined);
  });

  test('store.removeNodesByFile drops incident edges and returns count', () => {
    const store = new ClientGraphStore();
    const nodeA = makeNode('sg://app/src/gone.ts#a', 'a', 'src/gone.ts', [
      { targetId: 'sg://app/src/gone.ts#b', kind: 'CALLS', confidence: 'EXTRACTED', confidenceScore: 1.0, provenance: 'tree-sitter-ast' },
    ]);
    const nodeB = makeNode('sg://app/src/gone.ts#b', 'b', 'src/gone.ts');
    store.upsertNode(nodeA, 1);
    store.upsertNode(nodeB, 1);
    store.upsertEdge(nodeA.id, nodeB.id, nodeA.substrate.outgoingEdges[0], 'CONFIRMED');
    assert.equal(store.countEdges(), 1);

    const removed = store.removeNodesByFile('src/gone.ts');
    assert.equal(removed, 2);
    assert.equal(store.countNodes(), 0);
    assert.equal(store.countEdges(), 0);

    // Unknown file is a no-op returning 0.
    assert.equal(store.removeNodesByFile('src/missing.ts'), 0);
  });

  test('epoch GC compacts every 10 epochs without dropping live nodes', () => {
    const store = new ClientGraphStore();
    const reconciler = new DualBufferReconciler(store);
    const live = makeNode('sg://app/src/keep.ts#keep', 'keep', 'src/keep.ts');
    reconciler.applySubstrateDelta({
      protocolVersion: 1,
      epochId: 1,
      transactionId: 'tx-43-gc-1',
      vectorClock: { daemon: 1 },
      timestampMs: Date.now(),
      projectRoot: '/test',
      reconcileMode: 'delta',
      mutations: [{ type: 'NodeUpsert', node: live }],
    });
    // Advance 10+ epochs with empty deltas to trigger GC.
    for (let e = 2; e <= 12; e++) {
      reconciler.applySubstrateDelta({
        protocolVersion: 1,
        epochId: e,
        transactionId: `tx-43-gc-${e}`,
        vectorClock: { daemon: e },
        timestampMs: Date.now(),
        projectRoot: '/test',
        reconcileMode: 'delta',
        mutations: [],
      });
    }
    assert.ok(store.getNode(live.id));
    assert.equal(store.countNodes(), 1);
  });
});
