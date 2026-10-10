import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { UiServer } from '../src/ui/ui-server.js';
import { getViewerHtml } from '../src/ui/viewer-html.js';
import { ClientGraphStore } from '@pigeongraph/client';
import type { SuperNode } from '@pigeongraph/schema';

function makeNode(
  id: string,
  name: string,
  targets: string[] = [],
  extra: Partial<SuperNode> = {},
): SuperNode {
  return {
    id,
    urn: `urn:supergraph:app:${id}`,
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
      outgoingEdges: targets.map((targetId) => ({
        targetId,
        kind: 'CALLS' as const,
        confidence: 'high' as const,
        confidenceScore: 1,
        provenance: 'tree-sitter-ast' as const,
      })),
      astEpochTimestamp: new Date().toISOString(),
    },
    semantic: { validityStatus: 'VALID', communityClusters: [], semanticEmbeddings: [] },
    processFlow: { isEntryPoint: false, entryPointScore: 0, entryPointType: 'NONE' as any, processFlowSequences: [], crossRepoContracts: [] },
    ...extra,
  };
}

describe('PigeonGraph Live Canvas UI Server Tests', () => {
  let server: UiServer;
  let store: ClientGraphStore;
  let port: number;

  const mockNode: SuperNode = {
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
      sourceLocation: { filePath: 'src/auth/jwt.ts', startLine: 10, startColumn: 0, endLine: 25, endColumn: 1 },
      language: 'typescript',
      symbolSignature: 'export function verifyToken(token: string): boolean',
      outgoingEdges: [],
      astEpochTimestamp: new Date().toISOString(),
    },
    semantic: { validityStatus: 'VALID', communityClusters: [], semanticEmbeddings: [] },
    processFlow: { isEntryPoint: true, entryPointScore: 0.9, entryPointType: 'HTTP_ROUTE', processFlowSequences: [], crossRepoContracts: [] },
  };

  before(async () => {
    store = new ClientGraphStore();
    store.upsertNode(mockNode, 1);
    server = new UiServer({
      store,
      wsPort: 5051,
    });
    port = await server.start(0); // Port 0 binds random available ephemeral port
  });

  after(async () => {
    await server.close();
  });

  test('UiServer responds with 200 OK and HTML content on GET /', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/`);
    assert.equal(res.status, 200);
    assert.ok(res.headers.get('content-type')?.includes('text/html'));
    const html = await res.text();
    assert.ok(html.includes('PigeonGraph'));
    assert.ok(html.includes('canvas'));
  });

  test('UiServer serves graph snapshot on GET /api/graph', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/graph`);
    assert.equal(res.status, 200);
    const json = await res.json() as any;
    assert.ok(Array.isArray(json.nodes));
    assert.equal(json.nodes.length, 1);
    assert.equal(json.nodes[0].name, 'verifyToken');
  });

  test('UiServer responds with 200 on GET /health', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/health`);
    assert.equal(res.status, 200);
    const json = await res.json() as any;
    assert.equal(json.status, 'ok');
  });

  test('UiServer automatically falls back to next available port on EADDRINUSE', async () => {
    const srv1 = new UiServer({ store, wsPort: 5051 });
    const bound1 = await srv1.start(5130);
    assert.equal(bound1, 5130);

    const srv2 = new UiServer({ store, wsPort: 5051 });
    const bound2 = await srv2.start(5130);
    assert.equal(bound2, 5131, 'Second UiServer must automatically bind to 5131');

    await srv1.close();
    await srv2.close();
  });
});

describe('Task 5.3 UI observability: direction filter + riskBreakdown', () => {
  let server: UiServer;
  let port: number;
  const idA = 'sg://app/src/a.ts#fnA';
  const idB = 'sg://app/src/b.ts#fnB';
  const idC = 'sg://app/src/c.ts#fnC';

  before(async () => {
    const chain = new ClientGraphStore();
    chain.upsertNode(makeNode(idA, 'fnA', [idB]), 1);
    chain.upsertNode(makeNode(idB, 'fnB', [idC]), 2);
    chain.upsertNode(makeNode(idC, 'fnC', []), 3);
    server = new UiServer({ store: chain, wsPort: 5051 });
    port = await server.start(0);
  });

  after(async () => {
    await server.close();
  });

  test('direction=upstream with focus returns only ancestors + focus', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/graph?direction=upstream&focus=${encodeURIComponent(idB)}`);
    assert.equal(res.status, 200);
    const json = (await res.json()) as any;
    const ids = new Set(json.nodes.map((n: any) => n.id));
    assert.ok(ids.has(idA) && ids.has(idB), 'upstream of B must include A and B');
    assert.ok(!ids.has(idC), 'upstream of B must exclude C');
    assert.ok(json.nodes.length < 3, 'upstream must return a subset');
  });

  test('direction=downstream with focus returns only focus + descendants', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/graph?direction=downstream&focus=${encodeURIComponent(idB)}`);
    assert.equal(res.status, 200);
    const json = (await res.json()) as any;
    const ids = new Set(json.nodes.map((n: any) => n.id));
    assert.ok(ids.has(idB) && ids.has(idC), 'downstream of B must include B and C');
    assert.ok(!ids.has(idA), 'downstream of B must exclude A');
  });

  test('per-node riskBreakdown present with why-score fields', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/graph`);
    const json = (await res.json()) as any;
    assert.ok(json.nodes.length > 0);
    for (const n of json.nodes) {
      assert.ok(n.riskBreakdown, `node ${n.id} must carry riskBreakdown`);
      assert.equal(typeof n.riskBreakdown.score, 'number');
      assert.ok(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(n.riskBreakdown.level));
      for (const f of ['nodes', 'files', 'exported', 'entries']) {
        assert.equal(typeof n.riskBreakdown[f], 'number', `riskBreakdown.${f} must be a number`);
      }
    }
  });

  test('viewer HTML contains direction toggle + risk tooltip + flow path highlight', () => {
    const html = getViewerHtml(5051);
    assert.ok(html.includes('direction-toggle'), 'HTML must contain direction toggle control');
    assert.ok(html.includes('riskBreakdown') || html.includes('risk breakdown'), 'HTML must mention risk breakdown tooltip');
    assert.ok(html.includes('flow-highlight') || html.includes('flowPath') || html.includes('flow path'), 'HTML must implement flow path highlight');
    assert.ok(html.includes('/api/graph?direction='), 'toggle must reload /api/graph with direction param');
  });
});
