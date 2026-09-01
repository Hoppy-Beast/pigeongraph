import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  SubstrateDatabase,
  AstExtractor,
  DynamicDispatchSynthesizer,
  WebSocketStreamer,
} from '../src/index.js';
import { ClockManager, type SuperNode } from '@pigeongraph/schema';
import WebSocket from 'ws';

describe('Substrate Layer Engine Tests', () => {
  let db: SubstrateDatabase;
  let extractor: AstExtractor;
  let synthesizer: DynamicDispatchSynthesizer;
  let clock: ClockManager;

  before(() => {
    db = new SubstrateDatabase(':memory:');
    extractor = new AstExtractor();
    synthesizer = new DynamicDispatchSynthesizer();
    clock = new ClockManager('test-daemon');
  });

  after(() => {
    db.close();
  });

  test('AstExtractor parses TypeScript class and exported functions', () => {
    const tsCode = `
      import { KeyStore } from './keys.js';

      export class AuthService {
        private keyStore: KeyStore;

        async verifyToken(token: string): Promise<boolean> {
          return true;
        }
      }

      export async function loginUser(email: string): Promise<string> {
        return 'jwt_token';
      }
    `;

    const { nodes, fileHash } = extractor.parseFile({
      repoId: 'test-repo',
      filePath: 'src/auth/service.ts',
      content: tsCode,
      epoch: 1,
      lamportClock: 1,
    });

    assert.ok(fileHash.length === 64);
    assert.ok(nodes.length >= 4, `Expected at least 4 nodes, got ${nodes.length}`);

    const fileNode = nodes.find((n) => n.kind === 'file');
    const classNode = nodes.find((n) => n.kind === 'class');
    const methodNode = nodes.find((n) => n.kind === 'method');
    const fnNode = nodes.find((n) => n.kind === 'function');

    assert.ok(fileNode);
    assert.ok(classNode);
    assert.equal(classNode.name, 'AuthService');
    assert.ok(methodNode);
    assert.equal(methodNode.name, 'verifyToken');
    assert.ok(fnNode);
    assert.equal(fnNode.name, 'loginUser');

    // Verify Invariant Hashes are generated
    assert.ok(classNode.versioning.semanticValidityHash.length === 64);
    assert.ok(fnNode.versioning.semanticValidityHash.length === 64);
  });

  test('Database persists nodes and executes FTS5 full text search', () => {
    const tsCode = `
      export class PaymentProcessor {
        async chargeCustomer(amount: number): Promise<void> {
          // Stripe charge logic
        }
      }
    `;

    const { nodes } = extractor.parseFile({
      repoId: 'test-repo',
      filePath: 'src/payment/processor.ts',
      content: tsCode,
      epoch: 1,
      lamportClock: 1,
    });

    for (const node of nodes) {
      db.upsertNode(node);
    }

    const searchResults = db.searchFTS('PaymentProcessor');
    assert.ok(searchResults.length > 0);
    assert.equal(searchResults[0].name, 'PaymentProcessor');

    const methodSearch = db.searchFTS('chargeCustomer');
    assert.ok(methodSearch.length > 0);
    assert.equal(methodSearch[0].name, 'chargeCustomer');
  });

  test('DynamicDispatchSynthesizer pairs EventEmitters and Framework Routes', () => {
    const fileContents = new Map<string, string>();

    const producerCode = `
      export function placeOrder(orderId: string) {
        eventBus.emit('order:created', { id: orderId });
      }
    `;

    const consumerCode = `
      export function initInventory() {
        eventBus.on('order:created', (data) => {
          reserveStock(data.id);
        });
      }
    `;

    const routeCode = `
      app.get('/api/orders', listOrdersHandler);
      export function listOrdersHandler(req, res) {}
    `;

    fileContents.set('src/order/producer.ts', producerCode);
    fileContents.set('src/inventory/consumer.ts', consumerCode);
    fileContents.set('src/routes/orderRoutes.ts', routeCode);

    const nodes1 = extractor.parseFile({ repoId: 'app', filePath: 'src/order/producer.ts', content: producerCode, epoch: 1, lamportClock: 1 }).nodes;
    const nodes2 = extractor.parseFile({ repoId: 'app', filePath: 'src/inventory/consumer.ts', content: consumerCode, epoch: 1, lamportClock: 1 }).nodes;
    const nodes3 = extractor.parseFile({ repoId: 'app', filePath: 'src/routes/orderRoutes.ts', content: routeCode, epoch: 1, lamportClock: 1 }).nodes;

    const allNodes = [...nodes1, ...nodes2, ...nodes3];
    const { synthesizedEdges } = synthesizer.synthesize(allNodes, fileContents);

    // Verify Event Emitter synthesis
    const eventEdge = synthesizedEdges.find((e) => e.edge.kind === 'DYNAMIC_DISPATCH_EVENT');
    assert.ok(eventEdge, 'Should synthesize DYNAMIC_DISPATCH_EVENT edge');
    assert.equal(eventEdge.edge.dispatchMechanism, 'event_emitter.on(order:created)');

    // Verify Framework Route synthesis
    const routeEdge = synthesizedEdges.find((e) => e.edge.kind === 'HANDLES_ROUTE');
    assert.ok(routeEdge, 'Should synthesize HANDLES_ROUTE edge');
    assert.equal(routeEdge.edge.dispatchMechanism, 'HTTP GET /api/orders');
  });

  test('WebSocketStreamer broadcasts mutation delta frames to connected clients', async () => {
    const port = 5099;
    const streamer = new WebSocketStreamer({
      port,
      projectRoot: process.cwd(),
      clockManager: clock,
    });

    await streamer.start();

    const receivedMessages: string[] = [];
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);

    await new Promise<void>((resolve) => {
      ws.on('open', () => resolve());
    });

    ws.on('message', (data) => {
      receivedMessages.push(data.toString());
    });

    // Broadcast mutation
    const mockNode: SuperNode = {
      id: 'sg://test/src/foo.ts#bar',
      urn: 'urn:supergraph:test:src/foo.ts#bar',
      kind: 'function',
      name: 'bar',
      qualifiedName: 'bar',
      repoId: 'test',
      versioning: {
        lamportClock: 2,
        vectorClock: { substrate: 2 },
        layerEpochs: { substrateEpoch: 1, semanticEpoch: 0, processEpoch: 0 },
        contentSha256: '0'.repeat(64),
        astStructuralHash: '0'.repeat(64),
        semanticValidityHash: '0'.repeat(64),
      },
      substrate: {
        sourceLocation: { filePath: 'src/foo.ts', startLine: 1, startColumn: 0, endLine: 5, endColumn: 1 },
        language: 'typescript',
        outgoingEdges: [],
        astEpochTimestamp: new Date().toISOString(),
      },
      semantic: { validityStatus: 'VALID', communityClusters: [], semanticEmbeddings: [] },
      processFlow: { isEntryPoint: false, entryPointScore: 0, processFlowSequences: [], crossRepoContracts: [] },
    };

    streamer.broadcastMutations([{ type: 'NodeUpsert', node: mockNode }]);

    // Wait for message arrival
    await new Promise((resolve) => setTimeout(resolve, 50));

    assert.equal(receivedMessages.length, 1);
    const parsed = JSON.parse(receivedMessages[0]);
    assert.equal(parsed.protocolVersion, 1);
    assert.equal(parsed.mutations.length, 1);
    assert.equal(parsed.mutations[0].type, 'NodeUpsert');
    assert.equal(parsed.mutations[0].node.name, 'bar');

    ws.close();
    await streamer.close();
  });
});
