import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  ClientGraphStore,
  DualBufferReconciler,
  SuperGraphExploreEngine,
} from '../src/index.js';
import type { SuperNode } from '@pigeongraph/schema';

function makeNode(id: string, name: string, filePath: string): SuperNode {
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
      outgoingEdges: [],
      astEpochTimestamp: new Date().toISOString(),
    },
    semantic: { validityStatus: 'VALID', communityClusters: [], semanticEmbeddings: [] },
    processFlow: { isEntryPoint: false, entryPointScore: 0.1, processFlowSequences: [], crossRepoContracts: [] },
  };
}

describe('Explore empty-result hint (task 6.1)', () => {
  test('empty graph returns index hint', () => {
    const store = new ClientGraphStore();
    const engine = new SuperGraphExploreEngine(store);
    const res = engine.explore({ query: 'anythingAtAll', include_blast_radius: false, include_spans: false });

    assert.equal(res.symbols.length, 0);
    assert.equal(res.query_summary.total_graph_nodes_searched, 0);
    assert.ok(res.hint, 'expected hint on empty result');
    assert.ok(res.hint.toLowerCase().includes('empty graph'), 'hint names the empty-graph cause');
    assert.ok(res.hint.includes('pigeongraph index'), 'hint tells agent to run pigeongraph index');
  });

  test('populated graph with no match returns no-match hint', () => {
    const store = new ClientGraphStore();
    const reconciler = new DualBufferReconciler(store);
    reconciler.applySubstrateDelta({
      protocolVersion: 1,
      epochId: 1,
      transactionId: 'tx-6-1-hint',
      vectorClock: { daemon: 1 },
      timestampMs: Date.now(),
      projectRoot: '/test',
      reconcileMode: 'delta',
      mutations: [
        { type: 'NodeUpsert', node: makeNode('sg://app/src/auth/jwt.ts#verifyToken', 'verifyToken', 'src/auth/jwt.ts') },
      ],
    });
    const engine = new SuperGraphExploreEngine(store);
    const res = engine.explore({ query: 'zzzqqqxxx', include_blast_radius: false, include_spans: false });

    assert.equal(res.symbols.length, 0);
    assert.ok(res.query_summary.total_graph_nodes_searched > 0);
    assert.ok(res.hint, 'expected hint on no-match result');
    assert.ok(res.hint.toLowerCase().includes('no match'), 'hint names the no-match cause');
    assert.ok(res.hint.includes('pigeongraph index'), 'hint mentions pigeongraph index for stale graphs');
  });

  test('non-empty result carries no hint', () => {
    const store = new ClientGraphStore();
    const reconciler = new DualBufferReconciler(store);
    reconciler.applySubstrateDelta({
      protocolVersion: 1,
      epochId: 1,
      transactionId: 'tx-6-1-nohint',
      vectorClock: { daemon: 1 },
      timestampMs: Date.now(),
      projectRoot: '/test',
      reconcileMode: 'delta',
      mutations: [
        { type: 'NodeUpsert', node: makeNode('sg://app/src/auth/jwt.ts#verifyToken', 'verifyToken', 'src/auth/jwt.ts') },
      ],
    });
    const engine = new SuperGraphExploreEngine(store);
    const res = engine.explore({ query: 'verifyToken', include_blast_radius: false, include_spans: false });

    assert.ok(res.symbols.length > 0);
    assert.equal(res.hint, undefined);
  });
});
