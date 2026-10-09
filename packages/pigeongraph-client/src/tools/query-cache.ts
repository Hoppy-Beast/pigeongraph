import type { ExploreQueryInput, ExploreQueryResponse } from './explore-tool.js';

export interface CachedQueryEntry {
  response: ExploreQueryResponse;
  epoch: number;
}

function cloneResponse<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'null';
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => stableStringify(v)).join(',')}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`);
  return `{${entries.join(',')}}`;
}

function normalizeLimit(limit: number | undefined): number {
  return Math.min(Math.max(limit ?? 5, 1), 20);
}

function computeFlagsHash(input: ExploreQueryInput): string {
  const { query: _q, symbol_anchor: _a, depth: _d, limit: _l, ...flags } = input;
  return stableStringify(flags);
}

export function buildQueryCacheKey(input: ExploreQueryInput, epoch: number): string {
  const depth = input.depth ?? 3;
  const limit = normalizeLimit(input.limit);
  const flagsHash = computeFlagsHash(input);
  return JSON.stringify({
    query: input.query,
    symbol_anchor: input.symbol_anchor ?? null,
    depth,
    limit,
    flagsHash,
    epoch,
  });
}

export class QueryCache {
  public readonly maxSize: number;
  private entries = new Map<string, CachedQueryEntry>();
  private currentEpoch: number | null = null;

  constructor(maxSize = 200) {
    this.maxSize = maxSize;
  }

  public get size(): number {
    return this.entries.size;
  }

  public get(key: string): CachedQueryEntry | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    this.entries.delete(key);
    this.entries.set(key, entry);
    return { response: cloneResponse(entry.response), epoch: entry.epoch };
  }

  public set(key: string, response: ExploreQueryResponse, epoch: number): void {
    if (this.currentEpoch === null) {
      this.currentEpoch = epoch;
    }
    if (this.entries.has(key)) {
      this.entries.delete(key);
    } else if (this.entries.size >= this.maxSize) {
      const oldest = this.entries.keys().next();
      if (!oldest.done) {
        this.entries.delete(oldest.value);
      }
    }
    this.entries.set(key, { response: cloneResponse(response), epoch });
  }

  public clear(): void {
    this.entries.clear();
  }

  public invalidateOnEpoch(newEpoch: number): void {
    if (this.currentEpoch === null) {
      this.currentEpoch = newEpoch;
      return;
    }
    if (newEpoch !== this.currentEpoch) {
      this.entries.clear();
      this.currentEpoch = newEpoch;
    }
  }
}
