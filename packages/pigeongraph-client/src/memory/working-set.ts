import type { SuperNode } from '@pigeongraph/schema';

/** Minimal observational summary stored per working-set entry (v1 digest only). */
export interface WorkingSetSummary {
  resolved_anchor: string;
  resolved_score?: number;
  symbols_count: number;
  risk_level?: string;
}

export interface WorkingSetEntry {
  query: string;
  anchorId: string;
  /** Triple-invariant H_semantic_inv (SuperNode versioning.semanticValidityHash). */
  semanticValidityHash: string;
  summary: WorkingSetSummary;
  timestampMs: number;
  /** Repeat observations beyond the first record (second identical query => hits >= 1). */
  hits: number;
}

export type WorkingSetLookup =
  | { hit: true; stale: false; summary: WorkingSetSummary; hits: number }
  | { hit: false; stale: boolean };

/**
 * Working-set session memory: LRU of up to 50 query-anchored digests.
 * Keyed by `${query}::${anchorId}`; staleness is keyed by H_semantic_inv
 * (versioning.semanticValidityHash). Observational only — callers must NOT
 * short-circuit computation on a hit (deferred to 4.1 per task 3.2 ruling).
 * Deterministic, dependency-free.
 */
export class WorkingSet {
  public static readonly MAX_ENTRIES = 50;

  private store = new Map<string, WorkingSetEntry>();

  public get size(): number {
    return this.store.size;
  }

  private static key(query: string, anchorId: string): string {
    return `${query}::${anchorId}`;
  }

  public record(query: string, anchorNode: SuperNode, summary: WorkingSetSummary): WorkingSetEntry {
    const key = WorkingSet.key(query, anchorNode.id);
    const existing = this.store.get(key);
    const entry: WorkingSetEntry = {
      query,
      anchorId: anchorNode.id,
      semanticValidityHash: anchorNode.versioning.semanticValidityHash,
      summary: { ...summary },
      timestampMs: Date.now(),
      hits: (existing?.hits ?? 0) + (existing ? 1 : 0),
    };
    // Refresh LRU order.
    if (existing) this.store.delete(key);
    this.store.set(key, entry);
    // Evict oldest beyond capacity.
    while (this.store.size > WorkingSet.MAX_ENTRIES) {
      const oldest = this.store.keys().next();
      if (oldest.done) break;
      this.store.delete(oldest.value);
    }
    return { ...entry, summary: { ...entry.summary } };
  }

  public get(query: string, currentNode: SuperNode | undefined | null): WorkingSetLookup {
    if (!currentNode) return { hit: false, stale: false };
    const key = WorkingSet.key(query, currentNode.id);
    const stored = this.store.get(key);
    if (!stored) return { hit: false, stale: false };
    if (stored.semanticValidityHash !== currentNode.versioning.semanticValidityHash) {
      return { hit: false, stale: true };
    }
    // Hit: refresh LRU order and count the repeat observation.
    this.store.delete(key);
    stored.hits += 1;
    stored.timestampMs = Date.now();
    this.store.set(key, stored);
    return { hit: true, stale: false, summary: { ...stored.summary }, hits: stored.hits };
  }

  /** Most-recent-first entries, truncated to `limit` (default 10 for the <500-token digest). */
  public list(limit = 10): WorkingSetEntry[] {
    return Array.from(this.store.values())
      .reverse()
      .slice(0, Math.max(0, limit))
      .map((e) => ({ ...e, summary: { ...e.summary } }));
  }

  public clear(): void {
    this.store.clear();
  }
}
