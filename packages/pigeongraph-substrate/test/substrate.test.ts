import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  SubstrateDatabase,
  AstExtractor,
  DynamicDispatchSynthesizer,
  WebSocketStreamer,
  getDatabaseSyncConstructor,
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

  test('AstExtractor parses typed TypeScript/React components and typed arrow functions', () => {
    const tsxCode = `
      interface Props {
        children: React.ReactNode;
      }

      export const ProtectedRoute: React.FC<Props> = ({ children }) => {
        return <div className="protected">{children}</div>;
      };

      export const handleApiCall: ApiHandler<string> = async (req, res) => {
        return res.json({ ok: true });
      };
    `;

    const { nodes } = extractor.parseFile({
      repoId: 'test-repo',
      filePath: 'src/components/ProtectedRoute.tsx',
      content: tsxCode,
      epoch: 1,
      lamportClock: 1,
    });

    const routeNode = nodes.find((n) => n.name === 'ProtectedRoute');
    const handlerNode = nodes.find((n) => n.name === 'handleApiCall');

    assert.ok(routeNode, 'ProtectedRoute must be parsed as a node');
    assert.equal(routeNode?.kind, 'function');
    assert.ok(handlerNode, 'handleApiCall must be parsed as a node');
    assert.equal(handlerNode?.kind, 'function');
  });

  test('AstExtractor parses multi-line function signatures and parameters in TypeScript and Python', () => {
    const multiLineTs = `
      export async function calculateMetrics<
        T extends Record<string, unknown>
      >(
        primaryInput: string,
        secondaryOptions: T,
        threshold?: number
      ): Promise<Map<string, T>> {
        return new Map();
      }

      export const multiLineArrow = async (
        userId: string,
        roles: string[],
        dryRun: boolean = false
      ): Promise<boolean> => {
        return true;
      };
    `;

    const { nodes: tsNodes } = extractor.parseFile({
      repoId: 'test-repo',
      filePath: 'src/metrics.ts',
      content: multiLineTs,
      epoch: 1,
      lamportClock: 1,
    });

    const calcFn = tsNodes.find((n) => n.name === 'calculateMetrics');
    assert.ok(calcFn, 'calculateMetrics must be found despite multi-line signature');
    assert.equal(calcFn?.kind, 'function');
    assert.ok(calcFn?.substrate.parameters.some((p) => p.name === 'primaryInput'));
    assert.ok(calcFn?.substrate.parameters.some((p) => p.name === 'secondaryOptions'));
    assert.ok(calcFn?.substrate.parameters.some((p) => p.name === 'threshold'));

    const arrowFn = tsNodes.find((n) => n.name === 'multiLineArrow');
    assert.ok(arrowFn, 'multiLineArrow must be found despite multi-line signature');
    assert.ok(arrowFn?.substrate.parameters.some((p) => p.name === 'userId'));
    assert.ok(arrowFn?.substrate.parameters.some((p) => p.name === 'roles'));

    // Python multi-line
    const multiLinePy = `
def analyze_dataset(
    dataframe,
    batch_size: int = 128,
    use_cuda: bool = True
) -> dict:
    result = {}
    return result

def next_function():
    pass
    `;

    const { nodes: pyNodes } = extractor.parseFile({
      repoId: 'test-repo',
      filePath: 'src/analyze.py',
      content: multiLinePy,
      epoch: 1,
      lamportClock: 1,
    });

    const pyFn = pyNodes.find((n) => n.name === 'analyze_dataset');
    assert.ok(pyFn, 'analyze_dataset must be found despite multi-line signature');
    assert.equal(pyFn?.kind, 'function');
    assert.ok(pyFn?.substrate.parameters.some((p) => p.name === 'dataframe'));
    assert.ok(pyFn?.substrate.parameters.some((p) => p.name === 'batch_size'));
    assert.equal(pyFn?.substrate.returnType, 'dict');
    assert.ok(pyFn?.substrate.sourceLocation.endLine >= 7, 'Python endLine must encompass function body');
  });

  test('AstExtractor parses Markdown documents into structured document and section nodes with invariants', () => {
    const mdContent = `# 8. Testing Architecture

## Context
We are evaluating automated AST and knowledge graph indexing.

## Decision
Adopt PigeonGraph as the single-turn MCP exploration server for coding agents.
- invariant: All symbols must resolve in sub-50ms latency.
- invariant: Blast radius calculations must isolate breaking signature alterations.

## Consequences
Agents will spend fewer tokens on exploratory grepping.
`;

    const { nodes, edges } = extractor.parseFile({
      repoId: 'test-repo',
      filePath: 'docs/adr/0008-testing.md',
      content: mdContent,
      epoch: 1,
      lamportClock: 1,
    });

    assert.ok(nodes.length >= 4, `Expected at least 4 nodes (file + 4 headings), got ${nodes.length}`);

    const docNode = nodes.find((n) => n.kind === 'document');
    assert.ok(docNode, 'Document H1 node must exist');
    assert.equal(docNode?.name, '8. Testing Architecture');

    const decisionSection = nodes.find((n) => n.name === 'Decision');
    assert.ok(decisionSection, 'Decision section must exist');
    assert.equal(decisionSection?.kind, 'section');
    assert.ok(decisionSection?.substrate.sourceLocation.startLine > 1);

    // Verify invariants were extracted
    const invariants = decisionSection?.semantic.rationaleNodes?.[0]?.invariants;
    assert.ok(invariants && invariants.length === 2, 'Invariants must be extracted');
    assert.ok(invariants[0].includes('sub-50ms latency'));

    // Verify CONTAINS edge from file to section
    const containsDecision = edges.some((e) => e.edge.kind === 'CONTAINS' && e.targetId === decisionSection?.id);
    assert.ok(containsDecision, 'File must have CONTAINS edge to Decision section');
  });

  test('AstExtractor parses Go structs, receiver methods, packages, and call graph', () => {
    const goCode = `
      package server

      import (
        "fmt"
        "net/http"
      )

      type HttpServer struct {
        port int
      }

      func (s *HttpServer) Start() error {
        fmt.Println("Starting server")
        s.handleRequests()
        return nil
      }

      func (s *HttpServer) handleRequests() {
      }

      func NewServer(port int) *HttpServer {
        server := &HttpServer{port: port}
        server.Start()
        return server
      }
    `;

    const { nodes, edges } = extractor.parseFile({
      repoId: 'test-go-repo',
      filePath: 'pkg/server/server.go',
      content: goCode,
      epoch: 1,
      lamportClock: 1,
    });

    const structNode = nodes.find((n) => n.kind === 'struct');
    assert.ok(structNode, 'Should extract HttpServer struct');
    assert.equal(structNode.name, 'HttpServer');

    const startMethod = nodes.find((n) => n.kind === 'method' && n.name === 'Start');
    assert.ok(startMethod, 'Should extract Start receiver method');
    assert.equal(startMethod.qualifiedName, 'HttpServer.Start');

    const newServerFn = nodes.find((n) => n.kind === 'function' && n.name === 'NewServer');
    assert.ok(newServerFn, 'Should extract NewServer function');
    assert.equal(newServerFn.processFlow.isEntryPoint, true, 'Exported Go func should be entry point');

    // Check imports edge
    const importEdges = edges.filter((e) => e.edge.kind === 'IMPORTS');
    assert.ok(importEdges.length >= 2, 'Should extract Go imports');

    // Check call edge
    const callEdges = edges.filter((e) => e.edge.kind === 'CALLS');
    assert.ok(callEdges.length >= 1, 'Should extract CALLS edges in Go');
  });

  test('AstExtractor parses Rust structs, impl blocks, methods, and call graph', () => {
    const rustCode = `
      mod config;
      use std::sync::Arc;
      use crate::config::Config;

      pub struct Engine {
        running: bool,
      }

      impl Engine {
        pub fn new() -> Self {
          let mut eng = Engine { running: false };
          eng.initialize();
          eng
        }

        pub fn initialize(&mut self) {
          self.running = true;
        }

        pub fn search_path<P, M, S>(&mut self, path: P) {
          self.initialize();
        }
      }

      pub fn boot_system() {
        let eng = Engine::new();
      }
    `;

    const { nodes, edges } = extractor.parseFile({
      repoId: 'test-rust-repo',
      filePath: 'src/engine.rs',
      content: rustCode,
      epoch: 1,
      lamportClock: 1,
    });

    const structNode = nodes.find((n) => n.kind === 'struct');
    assert.ok(structNode, 'Should extract Engine struct');
    assert.equal(structNode.name, 'Engine');

    const newMethod = nodes.find((n) => n.kind === 'method' && n.name === 'new');
    assert.ok(newMethod, 'Should extract Engine::new impl method');
    assert.equal(newMethod.qualifiedName, 'Engine::new');

    const searchPathMethod = nodes.find((n) => n.kind === 'method' && n.name === 'search_path');
    assert.ok(searchPathMethod, 'Should extract generic Engine::search_path method');
    assert.equal(searchPathMethod.qualifiedName, 'Engine::search_path');

    const bootFn = nodes.find((n) => n.kind === 'function' && n.name === 'boot_system');
    assert.ok(bootFn, 'Should extract pub fn boot_system');
    assert.equal(bootFn.processFlow.isEntryPoint, true);

    const importEdges = edges.filter((e) => e.edge.kind === 'IMPORTS');
    assert.ok(importEdges.length >= 2, 'Should extract Rust use/mod imports');

    const callEdges = edges.filter((e) => e.edge.kind === 'CALLS');
    assert.ok(callEdges.length >= 1, 'Should extract CALLS edges in Rust');
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

  test('DynamicDispatchSynthesizer links cross-repo microservice HTTP contracts', () => {
    const fileContents = new Map<string, string>();

    // Frontend Repo Node
    const clientCode = `
      export async function submitOrder(cartId: string) {
        const res = await fetch('/api/v1/checkout', { method: 'POST' });
        return res.json();
      }
    `;

    // Backend Repo Route Node
    const serverCode = `
      app.post('/api/v1/checkout', checkoutHandler);
      export async function checkoutHandler(req, res) {
        res.json({ status: 'ok' });
      }
    `;

    fileContents.set('frontend/src/api/cart.ts', clientCode);
    fileContents.set('backend/src/routes/checkout.ts', serverCode);

    const clientNodes = extractor.parseFile({
      repoId: 'frontend-app',
      filePath: 'frontend/src/api/cart.ts',
      content: clientCode,
      epoch: 1,
      lamportClock: 1,
    }).nodes;

    const serverNodes = extractor.parseFile({
      repoId: 'backend-api',
      filePath: 'backend/src/routes/checkout.ts',
      content: serverCode,
      epoch: 1,
      lamportClock: 1,
    }).nodes;

    const allNodes = [...clientNodes, ...serverNodes];
    const { synthesizedEdges } = synthesizer.synthesize(allNodes, fileContents);

    // Verify cross-repo contract edge was synthesized
    const contractEdge = synthesizedEdges.find(
      (e) => e.edge.dispatchMechanism?.includes('CROSS_REPO_HTTP') || e.edge.kind === 'HANDLES_ROUTE'
    );
    assert.ok(contractEdge, 'Should synthesize cross-repo HTTP contract edge');

    // Verify contract linkage attached to caller node
    const callerNode = clientNodes.find((n) => n.name === 'submitOrder')!;
    assert.ok(callerNode.processFlow.crossRepoContracts.length > 0, 'Caller node should have cross-repo contract linkage');
    assert.equal(callerNode.processFlow.crossRepoContracts[0].role, 'CONSUMER');
    assert.equal(callerNode.processFlow.crossRepoContracts[0].protocol, 'REST_HTTP');
    assert.equal(callerNode.processFlow.crossRepoContracts[0].complianceStatus, 'COMPLIANT');

    // Verify contract linkage attached to handler node
    const handlerNode = serverNodes.find((n) => n.name === 'checkoutHandler')!;
    assert.ok(handlerNode.processFlow.crossRepoContracts.length > 0, 'Handler node should have cross-repo contract linkage');
    assert.equal(handlerNode.processFlow.crossRepoContracts[0].role, 'PROVIDER');
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

  test('getDatabaseSyncConstructor returns DatabaseSync with working sync API', () => {
    const DatabaseSync = getDatabaseSyncConstructor();
    assert.ok(DatabaseSync, 'Constructor must be returned');
    const testDb = new DatabaseSync(':memory:');
    testDb.exec('CREATE TABLE ping (id INT, msg TEXT);');
    testDb.prepare('INSERT INTO ping VALUES (?, ?)').run(1, 'pong');
    const row = testDb.prepare('SELECT msg FROM ping WHERE id = ?').get(1) as { msg: string };
    assert.equal(row.msg, 'pong');
    testDb.close();
  });
});
