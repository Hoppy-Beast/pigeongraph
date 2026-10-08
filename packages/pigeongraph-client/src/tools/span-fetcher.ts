import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

export interface SpanSymbolInput {
  filePath: string;
  lineRange: [number, number];
}

export interface FetchSpansOptions {
  projectRoot: string;
  tokenBudget?: number;
  dbContentProvider?: (filePath: string) => string | null;
}

export interface ServedSpan {
  filePath: string;
  ranges: Array<[number, number]>;
  content: string;
  token_count: number;
}

export interface FetchSpansResult {
  spans: ServedSpan[];
  truncated: boolean;
}

const DEFAULT_TOKEN_BUDGET = 800;

function readContent(filePath: string, opts: FetchSpansOptions): string | null {
  if (opts.dbContentProvider) {
    try {
      const provided = opts.dbContentProvider(filePath);
      if (provided === null || provided === undefined) return null;
      return provided;
    } catch {
      return null;
    }
  }
  try {
    const abs = resolve(join(opts.projectRoot, filePath));
    return readFileSync(abs, 'utf-8');
  } catch {
    return null;
  }
}

export function fetchSpans(
  symbols: Array<SpanSymbolInput>,
  opts: FetchSpansOptions
): FetchSpansResult {
  const tokenBudget = opts.tokenBudget ?? DEFAULT_TOKEN_BUDGET;

  // Dedupe identical filePath+ranges, group per file preserving first-seen order.
  const seen = new Set<string>();
  const grouped = new Map<string, Array<[number, number]>>();
  for (const s of symbols) {
    const key = `${s.filePath}:${s.lineRange[0]}:${s.lineRange[1]}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const list = grouped.get(s.filePath) ?? [];
    list.push([s.lineRange[0], s.lineRange[1]]);
    grouped.set(s.filePath, list);
  }

  // Merge overlapping/adjacent ranges per file.
  const allSpans: ServedSpan[] = [];
  for (const [filePath, ranges] of grouped) {
    const sorted = [...ranges].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const merged: Array<[number, number]> = [];
    for (const r of sorted) {
      const last = merged[merged.length - 1];
      if (last && r[0] <= last[1] + 1) {
        last[1] = Math.max(last[1], r[1]);
      } else {
        merged.push([r[0], r[1]]);
      }
    }

    const raw = readContent(filePath, opts);
    if (raw === null) {
      allSpans.push({
        filePath,
        ranges: merged,
        content: `// span unavailable: ${filePath}`,
        token_count: 0,
      });
      continue;
    }

    const lines = raw.split(/\r?\n/);
    const parts: string[] = [];
    for (const [start, end] of merged) {
      const s = Math.max(1, start);
      const e = Math.max(s, end);
      const slice = lines.slice(s - 1, e);
      if (slice.length > 0) parts.push(slice.join('\n'));
    }
    const content = parts.join('\n');
    allSpans.push({
      filePath,
      ranges: merged,
      content,
      token_count: Math.ceil(content.length / 4),
    });
  }

  // Enforce token budget in order.
  const included: ServedSpan[] = [];
  let used = 0;
  let truncated = false;
  for (const span of allSpans) {
    if (used + span.token_count > tokenBudget) {
      truncated = true;
      break;
    }
    included.push(span);
    used += span.token_count;
  }
  // If nothing fit but there were spans, mark truncated.
  if (included.length < allSpans.length) truncated = true;

  return { spans: included, truncated };
}
