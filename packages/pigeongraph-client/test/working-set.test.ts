import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { WorkingSet } from '../src/memory/working-set.js';
import type { SuperNode } from '@pigeongraph/schema';

function makeNode(id: string, name: string, semanticValidityHash: string): SuperNode {
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
      semanticValidityHash,
    },
    substrate: {
      sourceLocation: { filePath: `src/${name}.ts`, startLine: 1, startColumn: 0, endLine: 10, endColumn: 1 },
      language: 'typescript',
      symbolSignature: `export function ${name}()`,
      outgoingEdges: [],
      astEpochTimestamp: new Date().toISOString(),
    },
    semantic: { validityStatus: 'VALID', communityClusters: [], semanticEmbeddings: [] },
    processFlow: { isEntryPoint: false, entryPointScore: 0.1, processFlowSequences: [], crossRepoContracts: [] },
  };
}

describe('WorkingSet session memory (task 3.2)', () => {
  test('record then get returns cached summary with stale:false', () => {
    const ws = new WorkingSet();
    const node = makeNode('sg://app/src/a.ts#foo', 'foo', 'a'.repeat(64));
    ws.record('foo', node, { resolved_anchor: node.id, resolved_score: 95, symbols_count: 2, risk_level: 'LOW' });
    const res = ws.get('foo', node) as { hit: boolean; stale: boolean; summary: { resolved_anchor: string } };
    assert.equal(res.hit, true);
    assert.equal(res.stale, false);
    assert.equal(res.summary.resolved_anchor, node.id);
  });

  test('second identical record has hits>=1', () => {
    const ws = new WorkingSet();
    const node = makeNode('sg://app/src/a.ts#foo', 'foo', 'b'.repeat(64));
    ws.record('foo', node, { resolved_anchor: node.id, symbols_count: 1 });
    const entry = ws.record('foo', node, { resolved_anchor: node.id, symbols_count: 1 });
    assert.ok(entry.hits >= 1, `expected hits>=1, got ${entry.hits}`);
  });

  test('stale on H_semantic_inv change returns hit:false', () => {
    const ws = new WorkingSet();
    const v1 = makeNode('sg://app/src/a.ts#foo', 'foo', 'c'.repeat(64));
    ws.record('foo', v1, { resolved_anchor: v1.id, symbols_count: 1 });
    const v2 = makeNode('sg://app/src/a.ts#foo', 'foo', 'd'.repeat(64));
    const res = ws.get('foo', v2) as { hit: boolean };
    assert.equal(res.hit, false);
  });

  test('LRU evicts oldest at 50 entries', () => {
    const ws = new WorkingSet();
    for (let i = 0; i < 51; i++) {
      const n = makeNode(`sg://app/src/n.ts#fn${i}`, `fn${i}`, String(i).padStart(64, '0'));
      ws.record(`q${i}`, n, { resolved_anchor: n.id, symbols_count: 1 });
    }
    assert.equal(ws.size, 50);
    const evictedProbe = makeNode('sg://app/src/n.ts#fn0', 'fn0', String(0).padStart(64, '0'));
    assert.equal((ws.get('q0', evictedProbe) as { hit: boolean }).hit, false);
    const newestProbe = makeNode('sg://app/src/n.ts#fn50', 'fn50', String(50).padStart(64, '0'));
    assert.equal((ws.get('q50', newestProbe) as { hit: boolean }).hit, true);
  });

  test('clear empties the set', () => {
    const ws = new WorkingSet();
    const node = makeNode('sg://app/src/a.ts#foo', 'foo', 'e'.repeat(64));
    ws.record('foo', node, { resolved_anchor: node.id, symbols_count: 1 });
    ws.clear();
    assert.equal(ws.size, 0);
    assert.equal((ws.get('foo', node) as { hit: boolean }).hit, false);
  });
});
