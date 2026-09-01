import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import {
  ClientGraphStore,
  DualBufferReconciler,
  SuperGraphExploreEngine,
  AnalyticalToolsEngine,
} from '../src/index.js';
import type { SuperNode, GraphDeltaEnvelope } from '@supergraph/schema';

describe('Client Execution Layer & Query Surface Tests', () => {
  let store: ClientGraphStore;
  let reconciler: DualBufferReconciler;
  let exploreEngine: SuperGraphExploreEngine;
  let analyticalEngine: AnalyticalToolsEngine;

  const nodeA: SuperNode = {
    id: 'sg://app/src/auth/jwt.ts#verifyToken',
    urn: 'urn:supergraph:app:src/auth/jwt.ts#verifyToken',
    kind: 'function',
    name: 'verifyToken',
    qualifiedName: 'verifyToken',
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
      sourceLocation: { filePath: 'src/auth/jwt.ts', startLine: 10, startColumn: 0, endLine: 30, endColumn: 1 },
      language: 'typescript',
      symbolSignature: 'export function verifyToken(token: string): boolean',
      outgoingEdges: [
        {
          targetId: 'sg://app/src/auth/keys.ts#getKey',
          kind: 'CALLS',
          confidence: 'EXTRACTED',
          confidenceScore: 1.0,
          provenance: 'tree-sitter-ast',
        },
      ],
      astEpochTimestamp: new Date().toISOString(),
    },
    semantic: { validityStatus: 'VALID', communityClusters: [{ communityId: 'auth', communityLabel: 'Auth', cohesionScore: 0.9 }], semanticEmbeddings: [] },
    processFlow: { isEntryPoint: false, entryPointScore: 0.1, processFlowSequences: [], crossRepoContracts: [] },
  };

  const nodeB: SuperNode = {
    id: 'sg://app/src/auth/keys.ts#getKey',
    urn: 'urn:supergraph:app:src/auth/keys.ts#getKey',
    kind: 'function',
    name: 'getKey',
    qualifiedName: 'getKey',
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
      sourceLocation: { filePath: 'src/auth/keys.ts', startLine: 5, startColumn: 0, endLine: 15, endColumn: 1 },
      language: 'typescript',
      symbolSignature: 'export function getKey(): string',
      outgoingEdges: [],
      astEpochTimestamp: new Date().toISOString(),
    },
    semantic: { validityStatus: 'VALID', communityClusters: [], semanticEmbeddings: [] },
    processFlow: { isEntryPoint: false, entryPointScore: 0.1, processFlowSequences: [], crossRepoContracts: [] },
  };

  const nodeRoute: SuperNode = {
    id: 'sg://app/src/routes/api.ts#loginRoute',
    urn: 'urn:supergraph:app:src/routes/api.ts#loginRoute',
    kind: 'function',
    name: 'loginRoute',
    qualifiedName: 'loginRoute',
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
      sourceLocation: { filePath: 'src/routes/api.ts', startLine: 1, startColumn: 0, endLine: 10, endColumn: 1 },
      language: 'typescript',
      symbolSignature: 'export function loginRoute(req, res)',
      outgoingEdges: [
        {
          targetId: nodeA.id,
          kind: 'CALLS',
          confidence: 'EXTRACTED',
          confidenceScore: 1.0,
          provenance: 'tree-sitter-ast',
        },
      ],
      astEpochTimestamp: new Date().toISOString(),
    },
    semantic: { validityStatus: 'VALID', communityClusters: [], semanticEmbeddings: [] },
    processFlow: { isEntryPoint: true, entryPointScore: 0.95, entryPointType: 'HTTP_ROUTE', processFlowSequences: [], crossRepoContracts: [] },
  };

  before(() => {
    store = new ClientGraphStore();
    reconciler = new DualBufferReconciler(store);
    exploreEngine = new SuperGraphExploreEngine(store);
    analyticalEngine = new AnalyticalToolsEngine(store);
  });

  test('DualBufferReconciler applies AST diffs and delayed semantic patches seamlessly', () => {
    const envelope: GraphDeltaEnvelope = {
      protocolVersion: 1,
      epochId: 1,
      transactionId: 'tx-001',
      vectorClock: { daemon: 1 },
      timestampMs: Date.now(),
      projectRoot: '/test',
      reconcileMode: 'delta',
      mutations: [
        { type: 'NodeUpsert', node: nodeA },
        { type: 'NodeUpsert', node: nodeB },
        { type: 'NodeUpsert', node: nodeRoute },
      ],
    };

    const res = reconciler.applySubstrateDelta(envelope);
    assert.equal(res.appliedMutations, 3);
    assert.equal(store.countNodes(), 3);
    assert.equal(store.countEdges(), 2);

    // Apply delayed semantic patch
    const patchSuccess = reconciler.applySemanticPatch(
      nodeA.id,
      {
        conceptualSummary: 'High-speed JWT RSA token validator.',
        adrReferences: [{ adrId: 'ADR-004', title: 'Stateless Sessions', status: 'ACCEPTED' }],
      },
      2
    );

    assert.equal(patchSuccess, true);
    const updated = store.getNode(nodeA.id);
    assert.ok(updated);
    assert.equal(updated.semantic.conceptualSummary, 'High-speed JWT RSA token validator.');
    assert.equal(updated.substrate.symbolSignature, nodeA.substrate.symbolSignature);
  });

  test('SuperGraphExploreEngine answers architectural queries in 1 single turn', () => {
    const response = exploreEngine.explore({
      query: 'verifyToken',
      include_blast_radius: true,
    });

    assert.equal(response.query_summary.resolved_anchor, nodeA.id);
    assert.equal(response.query_summary.epistemic_status, 'EXACT');

    // Verify symbols
    assert.ok(response.symbols.length >= 1);
    assert.equal(response.symbols[0].name, 'verifyToken');

    // Verify execution flows (entry point loginRoute -> verifyToken -> getKey)
    assert.ok(response.execution_flows.entry_points.length >= 1);
    assert.equal(response.execution_flows.entry_points[0].handler, 'loginRoute');

    assert.ok(response.execution_flows.call_chains.length >= 1);
    assert.equal(response.execution_flows.call_chains[0].steps[0].symbol, 'verifyToken');
    assert.equal(response.execution_flows.call_chains[0].steps[1].symbol, 'getKey');

    // Verify blast radius
    assert.ok(response.blast_radius);
    assert.ok(response.blast_radius.affected_symbols_count >= 2);

    // Verify served spans
    assert.ok(response.served_spans.length >= 1);
    assert.equal(response.served_spans[0].filePath, 'src/auth/jwt.ts');
  });

  test('AnalyticalToolsEngine computes blast radius impact and traces shortest path', () => {
    // Blast radius impact
    const impact = analyticalEngine.calculateImpact({
      target_symbol: 'loginRoute',
      max_depth: 3,
    });

    assert.equal(impact.total_affected_nodes, 3); // loginRoute -> verifyToken -> getKey
    assert.ok(impact.affected_files.includes('src/routes/api.ts'));
    assert.ok(impact.affected_files.includes('src/auth/jwt.ts'));
    assert.ok(impact.affected_files.includes('src/auth/keys.ts'));

    // Path tracing: loginRoute -> getKey
    const trace = analyticalEngine.tracePath({
      from_symbol: 'loginRoute',
      to_symbol: 'getKey',
    });

    assert.equal(trace.found, true);
    assert.equal(trace.hop_count, 2);
    assert.equal(trace.path[0].name, 'loginRoute');
    assert.equal(trace.path[1].name, 'verifyToken');
    assert.equal(trace.path[2].name, 'getKey');
  });
});
