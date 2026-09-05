import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { UiServer } from '../src/ui/ui-server.js';
import { ClientGraphStore } from '@pigeongraph/client';
import type { SuperNode } from '@pigeongraph/schema';

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
});
