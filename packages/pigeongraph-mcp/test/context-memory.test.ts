import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { SuperGraphMcpServer } from '../src/server.js';
import { ClientGraphStore } from '@pigeongraph/client';
import type { SuperNode } from '@pigeongraph/schema';

describe('pigeongraph_context working-set memory tool (task 3.2)', () => {
  let server: SuperGraphMcpServer;

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
      semanticValidityHash: 'f'.repeat(64),
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
    const store = new ClientGraphStore();
    store.upsertNode(mockNode, 1);
    server = new SuperGraphMcpServer({ projectRoot: '/test', repoId: 'app', store });
  });

  test('tool definition pigeongraph_context with get|clear actions exists', () => {
    const defs = server.getToolDefinitions();
    const ctx = defs.find((d) => d.name === 'pigeongraph_context');
    assert.ok(ctx, 'expected pigeongraph_context tool definition');
    const schema = ctx.inputSchema as { properties: { action: { enum: string[] } }; required: string[] };
    assert.deepEqual(schema.properties.action.enum, ['get', 'clear']);
    assert.ok(schema.required.includes('action'));
  });

  test('explore records working set; second identical query has hits>=1', () => {
    server.handleToolCall('pigeongraph_explore', { query: 'verifyToken' });
    server.handleToolCall('pigeongraph_explore', { query: 'verifyToken' });
    const digest = server.handleToolCall('pigeongraph_context', { action: 'get' }) as {
      entries: Array<{ query: string; hits: number }>;
      count: number;
    };
    assert.ok(digest.count >= 1);
    const entry = digest.entries.find((e) => e.query === 'verifyToken');
    assert.ok(entry, 'expected verifyToken entry in digest');
    assert.ok(entry.hits >= 1, `expected hits>=1, got ${entry.hits}`);
  });

  test('context digest is small (<500 tokens total, each entry <50 tokens)', () => {
    const digest = server.handleToolCall('pigeongraph_context', { action: 'get' }) as {
      entries: Array<unknown>;
    };
    assert.ok(digest.entries.length <= 10, `expected max 10 entries, got ${digest.entries.length}`);
    for (const e of digest.entries) {
      assert.ok(JSON.stringify(e).length < 200, `entry exceeds ~50 tokens: ${JSON.stringify(e).length} chars`);
    }
    assert.ok(JSON.stringify(digest).length < 2000, `digest exceeds ~500 tokens: ${JSON.stringify(digest).length} chars`);
  });

  test('explore does not short-circuit (always computes fresh full response)', () => {
    const first = server.handleToolCall('pigeongraph_explore', { query: 'verifyToken' }) as {
      query_summary: { resolved_anchor: string };
      symbols: Array<{ name: string }>;
    };
    const second = server.handleToolCall('pigeongraph_explore', { query: 'verifyToken' }) as typeof first;
    assert.equal(first.query_summary.resolved_anchor, mockNode.id);
    assert.equal(second.query_summary.resolved_anchor, mockNode.id);
    assert.equal(second.symbols[0].name, 'verifyToken');
  });

  test('clear empties the working set', () => {
    server.handleToolCall('pigeongraph_context', { action: 'clear' });
    const digest = server.handleToolCall('pigeongraph_context', { action: 'get' }) as { count: number };
    assert.equal(digest.count, 0);
  });
});
