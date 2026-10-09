import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import {
  ClientGraphStore,
  DualBufferReconciler,
  SuperGraphExploreEngine,
  AnalyticalToolsEngine,
} from '../src/index.js';
import type { SuperNode, GraphDeltaEnvelope } from '@pigeongraph/schema';

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
        {
          targetId: 'sg://app/src/routes/api.ts#loginRoute',
          kind: 'HANDLES_ROUTE',
          confidence: 'EXTRACTED',
          confidenceScore: 0.95,
          provenance: 'native-synthesizer',
          dispatchMechanism: 'HTTP POST /api/login',
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
    assert.equal(store.countEdges(), 3);

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
    const deepChain = response.execution_flows.call_chains[0];
    assert.equal(deepChain.steps[0].symbol, 'loginRoute');
    const deepAnchorIdx = deepChain.steps.findIndex((s) => s.symbol === 'verifyToken');
    assert.ok(deepAnchorIdx >= 0);
    assert.equal(deepChain.steps[deepAnchorIdx].action, 'ORIGIN');
    assert.ok(deepChain.steps.slice(deepAnchorIdx + 1).some((s) => s.symbol === 'getKey'));

    // Verify blast radius
    assert.ok(response.blast_radius);
    assert.ok(response.blast_radius.affected_symbols_count >= 2);

    // Verify served spans
    assert.ok(response.served_spans.length >= 1);
    assert.equal(response.served_spans[0].filePath, 'src/auth/jwt.ts');
  });

  test('SuperGraphExploreEngine resolves fuzzy natural language queries with multi-signal ranking', () => {
    // Natural language query where individual words match across symbol name, docstrings, and comments
    const response = exploreEngine.explore({
      query: 'how to verify auth token in login flow',
      include_blast_radius: true,
    });

    assert.ok(response.query_summary.resolved_anchor, 'Should resolve an anchor for natural language query');
    assert.equal(response.query_summary.resolved_anchor, nodeA.id);
    assert.equal(response.symbols[0].name, 'verifyToken');
    assert.equal(response.query_summary.epistemic_status, 'PROVISIONAL_LOWER_BOUND');
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

  test('SuperGraphExploreEngine resolves route queries (/api/login, POST /api/login) directly to route handlers', () => {
    const response = exploreEngine.explore({
      query: '/api/login',
    });

    assert.equal(response.query_summary.resolved_anchor, nodeRoute.id);
    assert.equal(response.query_summary.epistemic_status, 'EXACT');
    assert.equal(response.symbols[0].name, 'loginRoute');
    assert.ok(response.execution_flows.entry_points.length >= 1);
    assert.equal(response.execution_flows.entry_points[0].route, 'HTTP POST /api/login');
  });

  test('Task 1.2: bfsBlastRadius honors upstream/downstream/both directions', () => {
    // Linear chain: loginRoute -> verifyToken -> getKey; anchor on middle node.
    const downstream = store.bfsBlastRadius(nodeA.id, { maxDepth: 3, direction: 'downstream' });
    assert.deepEqual(
      new Set(downstream.nodes.map((n) => n.id)),
      new Set([nodeA.id, nodeB.id])
    );

    const upstream = store.bfsBlastRadius(nodeA.id, { maxDepth: 3, direction: 'upstream' });
    assert.deepEqual(
      new Set(upstream.nodes.map((n) => n.id)),
      new Set([nodeRoute.id, nodeA.id])
    );

    const both = store.bfsBlastRadius(nodeA.id, { maxDepth: 3, direction: 'both' });
    assert.deepEqual(
      new Set(both.nodes.map((n) => n.id)),
      new Set([nodeRoute.id, nodeA.id, nodeB.id])
    );

    // Backward compat: numeric second arg still means downstream.
    const legacy = store.bfsBlastRadius(nodeA.id, 3);
    assert.deepEqual(
      new Set(legacy.nodes.map((n) => n.id)),
      new Set([nodeA.id, nodeB.id])
    );
  });

  test('Task 1.2: calculateImpact honors direction with unified risk', () => {
    const down = analyticalEngine.calculateImpact({
      target_symbol: 'verifyToken',
      direction: 'downstream',
      max_depth: 3,
    });
    assert.equal(down.total_affected_nodes, 2);
    assert.equal(down.risk_score, 0.3);
    assert.equal(down.risk_level, 'MEDIUM');

    const up = analyticalEngine.calculateImpact({
      target_symbol: 'verifyToken',
      direction: 'upstream',
      max_depth: 3,
    });
    assert.equal(up.total_affected_nodes, 2);
    assert.ok(up.affected_nodes.some((n) => n.uid === nodeRoute.id));
    assert.ok(!up.affected_nodes.some((n) => n.uid === nodeB.id));
    assert.equal(up.risk_score, 0.4);

    // Deterministic: repeated calls agree.
    const again = analyticalEngine.calculateImpact({
      target_symbol: 'verifyToken',
      direction: 'upstream',
      max_depth: 3,
    });
    assert.deepEqual(again, up);
  });

  test('Task 1.2: explore blast radius uses both directions with unified risk', () => {
    const response = exploreEngine.explore({ query: 'verifyToken', include_blast_radius: true });
    assert.ok(response.blast_radius);
    assert.equal(response.blast_radius.affected_symbols_count, 3);
    assert.ok(response.blast_radius.affected_files?.includes('src/routes/api.ts'));
    assert.equal(response.blast_radius.risk_score, 0.55);
    assert.equal(response.blast_radius.risk_level, 'HIGH');
  });

  test('Task 1.3: deep execution flows multi-hop with cycle guard', () => {
    const makeNode = (
      id: string,
      name: string,
      opts: { isEntryPoint: boolean; entryPointType?: string; outgoingEdges?: SuperNode['substrate']['outgoingEdges'] }
    ): SuperNode => ({
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
        sourceLocation: { filePath: `src/${name}.ts`, startLine: 1, startColumn: 0, endLine: 10, endColumn: 1 },
        language: 'typescript',
        symbolSignature: `export function ${name}()`,
        outgoingEdges: opts.outgoingEdges ?? [],
        astEpochTimestamp: new Date().toISOString(),
      },
      semantic: { validityStatus: 'VALID', communityClusters: [], semanticEmbeddings: [] },
      processFlow: {
        isEntryPoint: opts.isEntryPoint,
        entryPointScore: opts.isEntryPoint ? 0.95 : 0.1,
        entryPointType: opts.entryPointType,
        processFlowSequences: [],
        crossRepoContracts: [],
      },
    });

    const entryId = 'sg://app/src/entry.ts#entryFn';
    const midId = 'sg://app/src/mid.ts#midFn';
    const leafId = 'sg://app/src/leaf.ts#leafFn';
    const entryNode = makeNode('sg://app/src/entry.ts#entryFn', 'entryFn', {
      isEntryPoint: true,
      entryPointType: 'HTTP_ROUTE',
      outgoingEdges: [
        { targetId: midId, kind: 'CALLS', confidence: 'EXTRACTED', confidenceScore: 1.0, provenance: 'tree-sitter-ast' },
        {
          targetId: entryId,
          kind: 'HANDLES_ROUTE',
          confidence: 'EXTRACTED',
          confidenceScore: 0.95,
          provenance: 'native-synthesizer',
          dispatchMechanism: 'HTTP GET /entry',
        },
      ],
    });
    const midNode = makeNode('sg://app/src/mid.ts#midFn', 'midFn', {
      isEntryPoint: false,
      outgoingEdges: [
        { targetId: leafId, kind: 'CALLS', confidence: 'EXTRACTED', confidenceScore: 1.0, provenance: 'tree-sitter-ast' },
      ],
    });
    const leafNode = makeNode('sg://app/src/leaf.ts#leafFn', 'leafFn', {
      isEntryPoint: false,
      outgoingEdges: [
        { targetId: midId, kind: 'CALLS', confidence: 'EXTRACTED', confidenceScore: 1.0, provenance: 'tree-sitter-ast' },
      ],
    });

    const isoStore = new ClientGraphStore();
    const isoReconciler = new DualBufferReconciler(isoStore);
    isoReconciler.applySubstrateDelta({
      protocolVersion: 1,
      epochId: 1,
      transactionId: 'tx-1-3-red',
      vectorClock: { daemon: 1 },
      timestampMs: Date.now(),
      projectRoot: '/test',
      reconcileMode: 'delta',
      mutations: [
        { type: 'NodeUpsert', node: entryNode },
        { type: 'NodeUpsert', node: midNode },
        { type: 'NodeUpsert', node: leafNode },
      ],
    });
    const isoExplore = new SuperGraphExploreEngine(isoStore);
    const response = isoExplore.explore({
      query: 'midFn',
      symbol_anchor: midId,
      include_blast_radius: false,
      include_spans: false,
    });

    assert.ok(response.execution_flows.call_chains.length >= 1, 'expected at least 1 chain');
    assert.ok(response.execution_flows.call_chains.length <= 3, 'expected max 3 chains');
    const chain = response.execution_flows.call_chains[0];
    assert.equal(chain.steps[0].symbol, 'entryFn', 'hop 0 should be entry point');
    const anchorStep = chain.steps.find((s) => s.symbol === 'midFn');
    assert.ok(anchorStep, 'anchor midFn present in chain');
    assert.equal(anchorStep.action, 'ORIGIN');
    const anchorIdx = chain.steps.findIndex((s) => s.symbol === 'midFn');
    assert.ok(
      chain.steps.slice(anchorIdx + 1).some((s) => s.symbol === 'leafFn'),
      'downstream leafFn present after anchor'
    );
    assert.ok(chain.steps.length <= 7, 'chain capped at 7 steps');
    assert.equal(new Set(chain.steps.map((s) => s.symbol)).size, chain.steps.length, 'no repeated nodes (cycle guard)');
    for (const step of chain.steps.slice(1)) {
      assert.ok((step as { edgeKind?: string }).edgeKind, `hop ${step.hop} should carry edgeKind`);
    }
    assert.ok(chain.chain_id.startsWith('flow_midFn_'));
    assert.ok(response.execution_flows.entry_points.length >= 1);
    assert.equal(response.execution_flows.entry_points[0].route, 'HTTP GET /entry');
  });

  test('Task 1.4: resolver parity — fuzzy partial resolves same node across explore/impact/trace', () => {
    const partial = 'verifyTok';
    const exploreRes = exploreEngine.explore({ query: partial, include_blast_radius: false, include_spans: false });
    assert.equal(exploreRes.query_summary.resolved_anchor, nodeA.id);
    const summary = exploreRes.query_summary as unknown as {
      resolved_score?: number;
      alternatives?: Array<{ uid: string; score: number }>;
    };
    assert.equal(typeof summary.resolved_score, 'number');
    assert.ok(Array.isArray(summary.alternatives));
    assert.ok(summary.alternatives.length >= 1 && summary.alternatives.length <= 3);
    assert.equal(summary.alternatives[0].uid, nodeA.id);

    const impact = analyticalEngine.calculateImpact({ target_symbol: partial, max_depth: 3 });
    assert.equal(impact.target, nodeA.id);
    assert.ok(impact.total_affected_nodes >= 2);

    const trace = analyticalEngine.tracePath({ from_symbol: partial, to_symbol: 'getKe' });
    assert.equal(trace.found, true);
    assert.equal(trace.from, nodeA.id);
    assert.equal(trace.to, nodeB.id);
  });

  test('Task 3.1: explore surfaces semantic_context for ADR-linked anchor only', () => {
    const linkedId = 'sg://app/src/billing/invoice.ts#chargeInvoice';
    const plainId = 'sg://app/src/util/format.ts#formatMoney';
    const linkedNode: SuperNode = {
      id: linkedId,
      urn: 'urn:test:chargeInvoice',
      kind: 'function',
      name: 'chargeInvoice',
      qualifiedName: 'chargeInvoice',
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
        sourceLocation: { filePath: 'src/billing/invoice.ts', startLine: 1, startColumn: 0, endLine: 20, endColumn: 1 },
        language: 'typescript',
        symbolSignature: 'export function chargeInvoice(id: string)',
        outgoingEdges: [
          {
            targetId: 'sg://app/docs/billing-spec.md#REQ-001',
            kind: 'IMPLEMENTS',
            confidence: 'EXTRACTED',
            confidenceScore: 0.95,
            provenance: 'llm-inference',
            dispatchMechanism: 'IMPLEMENTS_SPEC: REQ-001',
          },
          {
            targetId: 'sg://app/docs/adr/adr-007.md#ADR-007',
            kind: 'REFERENCES',
            confidence: 'EXTRACTED',
            confidenceScore: 0.95,
            provenance: 'llm-inference',
            dispatchMechanism: 'JUSTIFIED_BY_ADR: ADR-007',
          },
        ],
        astEpochTimestamp: new Date().toISOString(),
      },
      semantic: {
        validityStatus: 'VALID',
        conceptualSummary: 'Charges an invoice via the billing provider.',
        adrReferences: [{ adrId: 'ADR-007', title: 'Usage-Based Billing', status: 'ACCEPTED' }],
        multimodalAssociations: [
          { assetType: 'markdown_doc', uri: 'docs/billing-spec.md', title: 'Billing Spec', relevanceScore: 0.9, extractedSnippet: 'REQ-001: chargeInvoice must bill.' },
        ],
        communityClusters: [],
        semanticEmbeddings: [],
      },
      processFlow: { isEntryPoint: false, entryPointScore: 0.1, processFlowSequences: [], crossRepoContracts: [] },
    };
    const plainNode: SuperNode = {
      id: plainId,
      urn: 'urn:test:formatMoney',
      kind: 'function',
      name: 'formatMoney',
      qualifiedName: 'formatMoney',
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
        sourceLocation: { filePath: 'src/util/format.ts', startLine: 1, startColumn: 0, endLine: 10, endColumn: 1 },
        language: 'typescript',
        symbolSignature: 'export function formatMoney(n: number)',
        outgoingEdges: [],
        astEpochTimestamp: new Date().toISOString(),
      },
      semantic: { validityStatus: 'VALID', communityClusters: [], semanticEmbeddings: [] },
      processFlow: { isEntryPoint: false, entryPointScore: 0.1, processFlowSequences: [], crossRepoContracts: [] },
    };

    const isoStore = new ClientGraphStore();
    const isoReconciler = new DualBufferReconciler(isoStore);
    isoReconciler.applySubstrateDelta({
      protocolVersion: 1,
      epochId: 1,
      transactionId: 'tx-3-1-red',
      vectorClock: { daemon: 1 },
      timestampMs: Date.now(),
      projectRoot: '/test',
      reconcileMode: 'delta',
      mutations: [
        { type: 'NodeUpsert', node: linkedNode },
        { type: 'NodeUpsert', node: plainNode },
      ],
    });
    const isoExplore = new SuperGraphExploreEngine(isoStore);

    const linked = isoExplore.explore({
      query: 'chargeInvoice',
      symbol_anchor: linkedId,
      include_blast_radius: false,
      include_spans: false,
    });
    assert.ok(linked.semantic_context, 'expected semantic_context for linked anchor');
    assert.equal(linked.semantic_context.length, 1);
    const entry = linked.semantic_context[0];
    assert.equal(entry.uid, linkedId);
    assert.equal(entry.conceptualSummary, 'Charges an invoice via the billing provider.');
    assert.ok(entry.implements_spec.some((s) => s.reqId === 'REQ-001'), 'expected REQ-001 in implements_spec');
    assert.ok(entry.justified_by_adr.some((a) => a.adrId === 'ADR-007'), 'expected ADR-007 in justified_by_adr');
    assert.equal(entry.confidence, 'EXTRACTED');

    const unlinked = isoExplore.explore({
      query: 'formatMoney',
      symbol_anchor: plainId,
      include_blast_radius: false,
      include_spans: false,
    });
    assert.ok(
      unlinked.semantic_context === undefined || unlinked.semantic_context.length === 0,
      'unlinked anchor must show empty/undefined, no placeholder'
    );

    const compact = isoExplore.explore({
      query: 'chargeInvoice',
      symbol_anchor: linkedId,
      include_blast_radius: false,
      include_spans: false,
      include_semantic: false,
    });
    assert.equal(compact.semantic_context, undefined);
  });
});
