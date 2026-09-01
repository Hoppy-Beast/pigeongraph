import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { SuperGraphMcpServer } from '../src/index.js';
import { ClientGraphStore } from '@supergraph/client';
import type { SuperNode } from '@supergraph/schema';

describe('PigeonGraph MCP Server Protocol Tests', () => {
  let server: SuperGraphMcpServer;
  let store: ClientGraphStore;

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

  before(() => {
    store = new ClientGraphStore();
    store.upsertNode(mockNode, 1);
    server = new SuperGraphMcpServer({
      projectRoot: '/test',
      repoId: 'app',
      store,
    });
  });

  test('MCP server responds to initialize handshake', () => {
    const initReq = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2024-11-05' },
    });

    const resp = server.handleJsonRpcMessage(initReq);
    assert.ok(resp);
    const parsed = JSON.parse(resp);
    assert.equal(parsed.id, 1);
    assert.equal(parsed.result.serverInfo.name, 'pigeongraph-mcp');
    assert.ok(parsed.result.capabilities.tools);
  });

  test('MCP server lists tools with pigeongraph_explore as primary 1-shot tool', () => {
    const listReq = JSON.stringify({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
    });

    const resp = server.handleJsonRpcMessage(listReq);
    assert.ok(resp);
    const parsed = JSON.parse(resp);
    assert.equal(parsed.id, 2);

    const tools = parsed.result.tools;
    assert.ok(tools.length >= 3);
    const exploreTool = tools.find((t: any) => t.name === 'pigeongraph_explore');
    assert.ok(exploreTool);
    assert.ok(exploreTool.inputSchema.properties.query);
  });

  test('MCP server executes tools/call for pigeongraph_explore returning valid JSON', () => {
    const callReq = JSON.stringify({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'pigeongraph_explore',
        arguments: { query: 'verifyToken' },
      },
    });

    const resp = server.handleJsonRpcMessage(callReq);
    assert.ok(resp);
    const parsed = JSON.parse(resp);
    assert.equal(parsed.id, 3);

    const content = parsed.result.content[0];
    assert.equal(content.type, 'text');
    const resultObj = JSON.parse(content.text);
    assert.equal(resultObj.query_summary.resolved_anchor, mockNode.id);
    assert.equal(resultObj.symbols[0].name, 'verifyToken');
  });

  test('MCP server returns error on unknown method or tool', () => {
    const unknownMethod = JSON.stringify({
      jsonrpc: '2.0',
      id: 4,
      method: 'unknown/method',
    });
    const resp1 = server.handleJsonRpcMessage(unknownMethod);
    assert.ok(resp1);
    const parsed1 = JSON.parse(resp1);
    assert.equal(parsed1.error.code, -32601);

    const unknownTool = JSON.stringify({
      jsonrpc: '2.0',
      id: 5,
      method: 'tools/call',
      params: { name: 'nonexistent_tool', arguments: {} },
    });
    const resp2 = server.handleJsonRpcMessage(unknownTool);
    assert.ok(resp2);
    const parsed2 = JSON.parse(resp2);
    assert.equal(parsed2.error.code, -32603);
  });
});
