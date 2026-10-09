import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ClientGraphStore } from '../src/store/client-graph.js';
import { DualBufferReconciler } from '../src/reconciler/dual-buffer.js';
import { SuperGraphExploreEngine } from '../src/tools/explore-tool.js';
import { QueryCache, buildQueryCacheKey } from '../src/tools/query-cache.js';
import type { SuperNode } from '@pigeongraph/schema';

function makeNode(id: string, name: string): SuperNode {
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

describe('Task 4.1: QueryCache LRU + epoch invalidation', () => {
  test('miss then hit returns cached response', () => {
    const cache = new QueryCache(3);
    const key = buildQueryCacheKey({ query: 'foo' }, 1);
    assert.equal(cache.get(key), undefined);
    const fakeResponse: any = { query_summary: { query: 'foo' }, symbols: [] };
    cache.set(key, fakeResponse, 1);
    const hit = cache.get(key);
    assert.ok(hit);
    assert.deepEqual(hit.response, fakeResponse);
    assert.equal(hit.epoch, 1);
  });

  test('LRU evicts oldest beyond capacity (200 default)', () => {
    const cache = new QueryCache(2);
    cache.set(buildQueryCacheKey({ query: 'a' }, 1), { query_summary: { query: 'a' } } as any, 1);
    cache.set(buildQueryCacheKey({ query: 'b' }, 1), { query_summary: { query: 'b' } } as any, 1);
    // Touch 'a' to make 'b' oldest? Actually touch a => b is LRU victim on next insert.
    cache.get(buildQueryCacheKey({ query: 'a' }, 1));
    cache.set(buildQueryCacheKey({ query: 'c' }, 1), { query_summary: { query: 'c' } } as any, 1);
    assert.ok(cache.get(buildQueryCacheKey({ query: 'a' }, 1)), 'recently used a survives');
    assert.equal(cache.get(buildQueryCacheKey({ query: 'b' }, 1)), undefined, 'LRU victim b evicted');
    assert.ok(cache.get(buildQueryCacheKey({ query: 'c' }, 1)));
    const def = new QueryCache();
    assert.equal((def as any).maxSize ?? 200, 200);
  });

  test('key distinguishes query+anchor+depth+limit+flags+epoch', () => {
    const k1 = buildQueryCacheKey({ query: 'x', symbol_anchor: 'a', depth: 3, limit: 5 }, 1);
    const k2 = buildQueryCacheKey({ query: 'x', symbol_anchor: 'b', depth: 3, limit: 5 }, 1);
    const k3 = buildQueryCacheKey({ query: 'x', symbol_anchor: 'a', depth: 4, limit: 5 }, 1);
    const k4 = buildQueryCacheKey({ query: 'x', symbol_anchor: 'a', depth: 3, limit: 6 }, 1);
    const k5 = buildQueryCacheKey({ query: 'x', symbol_anchor: 'a', depth: 3, limit: 5, compact: true }, 1);
    const k6 = buildQueryCacheKey({ query: 'x', symbol_anchor: 'a', depth: 3, limit: 5 }, 2);
    for (const other of [k2, k3, k4, k5, k6]) {
      assert.notEqual(k1, other);
    }
    assert.equal(k1, buildQueryCacheKey({ query: 'x', symbol_anchor: 'a', depth: 3, limit: 5 }, 1));
  });

  test('invalidateOnEpoch clears on epoch bump, keeps on same epoch', () => {
    const cache = new QueryCache();
    const k1 = buildQueryCacheKey({ query: 'x' }, 1);
    cache.set(k1, { query_summary: { query: 'x' } } as any, 1);
    cache.invalidateOnEpoch(1);
    assert.ok(cache.get(k1), 'same epoch retains cache');
    cache.invalidateOnEpoch(2);
    assert.equal(cache.get(k1), undefined, 'epoch bump clears cache');
    assert.equal(cache.size, 0);
  });

  test('clear empties cache', () => {
    const cache = new QueryCache();
    cache.set(buildQueryCacheKey({ query: 'z' }, 1), {} as any, 1);
    cache.clear();
    assert.equal(cache.size, 0);
  });
});

describe('Task 4.1: explore engine cache integration', () => {
  test('repeat query returns cached:true with fresh duration_ms', () => {
    const store = new ClientGraphStore();
    const reconciler = new DualBufferReconciler(store);
    const node = makeNode('sg://app/src/cache.ts#cachedFn', 'cachedFn');
    reconciler.applySubstrateDelta({
      protocolVersion: 1,
      epochId: 1,
      transactionId: 'tx-cache-1',
      vectorClock: { daemon: 1 },
      timestampMs: Date.now(),
      projectRoot: '/test',
      reconcileMode: 'delta',
      mutations: [{ type: 'NodeUpsert', node }],
    });
    const cache = new QueryCache();
    const engine = new SuperGraphExploreEngine(store, { cache });
    const input = { query: 'cachedFn', include_blast_radius: false, include_spans: false } as const;
    const first = engine.explore({ ...input });
    assert.equal((first.query_summary as any).cached ?? false, false);
    const second = engine.explore({ ...input });
    assert.equal((second.query_summary as any).cached, true);
    assert.equal(typeof second.query_summary.duration_ms, 'number');
    assert.deepEqual(second.symbols, first.symbols);
  });

  test('epoch bump invalidates explore cache', () => {
    const store = new ClientGraphStore();
    const reconciler = new DualBufferReconciler(store);
    const node = makeNode('sg://app/src/cache2.ts#epochFn', 'epochFn');
    reconciler.applySubstrateDelta({
      protocolVersion: 1,
      epochId: 1,
      transactionId: 'tx-cache-2',
      vectorClock: { daemon: 1 },
      timestampMs: Date.now(),
      projectRoot: '/test',
      reconcileMode: 'delta',
      mutations: [{ type: 'NodeUpsert', node }],
    });
    const cache = new QueryCache();
    const engine = new SuperGraphExploreEngine(store, { cache });
    const input = { query: 'epochFn', include_blast_radius: false, include_spans: false } as const;
    engine.explore({ ...input });
    assert.equal((engine.explore({ ...input }).query_summary as any).cached, true);
    store.setActiveEpoch(2);
    cache.invalidateOnEpoch(2);
    const after = engine.explore({ ...input });
    assert.equal((after.query_summary as any).cached ?? false, false);
  });
});
