import type { SuperNode } from '@pigeongraph/schema';
import type { ClientGraphStore } from '../store/client-graph.js';

export type EpistemicStatus = 'EXACT' | 'PROVISIONAL_LOWER_BOUND';

export interface RankedNode {
  node: SuperNode;
  score: number;
}

export interface RankResult {
  ranked: RankedNode[];
  epistemicStatus: EpistemicStatus;
}

export interface ResolvedSymbol {
  node: SuperNode;
  score: number;
  status: EpistemicStatus;
}

type StoreLike = Pick<ClientGraphStore, 'getNode'>;

const EXACT_SCORE = 100;
const ROUTE_SCORE = 100;
const SUBSTRING_NAME_SCORE = 80;
const SUBSTRING_QNAME_SCORE = 75;
const SUBSTRING_PATH_SCORE = 60;

const byScoreThenId = (a: RankedNode, b: RankedNode): number =>
  b.score - a.score || (a.node.id < b.node.id ? -1 : a.node.id > b.node.id ? 1 : 0);

/**
 * Shared deterministic resolver used by explore / impact / trace.
 *
 * Tiers (in order):
 * 1. Route match (HANDLES_ROUTE dispatchMechanism) -> EXACT, score 100.
 * 2. Exact name / qualifiedName / id match (case-insensitive) -> EXACT, score 100.
 * 3. Substring match (name / qualifiedName / filePath) -> EXACT, score 80/75/60.
 *    Kept EXACT for backward compat (pre-1.4 behavior); alternatives are now
 *    always returned so callers can see the ambiguity. Strictly, only tiers
 *    1-2 are "exact"; substring EXACT is a documented compat exception.
 * 4. Multi-signal token fuzzy scoring -> PROVISIONAL_LOWER_BOUND.
 *
 * No dependencies, no randomness; ties broken by node id ascending.
 */
export function rankNodesFuzzy(
  query: string,
  nodes: SuperNode[],
  store?: StoreLike
): RankResult {
  const queryTerm = query.toLowerCase().trim();
  if (!queryTerm) return { ranked: [], epistemicStatus: 'PROVISIONAL_LOWER_BOUND' };

  // 0. Direct route / dispatch-mechanism match.
  const isRouteOrMethodQuery =
    queryTerm.startsWith('/') ||
    queryTerm.startsWith('get ') ||
    queryTerm.startsWith('post ') ||
    queryTerm.startsWith('put ') ||
    queryTerm.startsWith('delete ') ||
    queryTerm.startsWith('patch ');

  const normalizedRoute = queryTerm.replace(/^(get|post|put|delete|patch)\s+/, '').trim();
  const routeMatched = new Map<string, SuperNode>();

  for (const node of nodes) {
    for (const edge of node.substrate.outgoingEdges) {
      if (edge.kind === 'HANDLES_ROUTE' && edge.dispatchMechanism) {
        const mech = edge.dispatchMechanism.toLowerCase();
        if (
          mech === queryTerm ||
          mech.includes(queryTerm) ||
          (normalizedRoute && normalizedRoute.length > 1 && mech.includes(normalizedRoute))
        ) {
          const targetNode = store?.getNode(edge.targetId) ?? nodes.find((n) => n.id === edge.targetId) ?? null;
          if (targetNode && !routeMatched.has(targetNode.id)) {
            routeMatched.set(targetNode.id, targetNode);
          }
          if (!routeMatched.has(node.id)) {
            routeMatched.set(node.id, node);
          }
        }
      }
    }
  }

  if (routeMatched.size > 0 && (isRouteOrMethodQuery || queryTerm.includes('/'))) {
    const ranked = Array.from(routeMatched.values())
      .map((node) => ({ node, score: ROUTE_SCORE }))
      .sort(byScoreThenId);
    return { ranked, epistemicStatus: 'EXACT' };
  }

  // 1. Direct exact match (name / qualifiedName / id / id-suffix, case-insensitive).
  const exact = nodes.filter(
    (n) =>
      n.name.toLowerCase() === queryTerm ||
      n.qualifiedName.toLowerCase() === queryTerm ||
      n.id.toLowerCase() === queryTerm ||
      n.id.toLowerCase().endsWith(`#${queryTerm}`)
  );
  if (exact.length > 0) {
    const ranked = exact
      .map((node) => ({ node, score: EXACT_SCORE }))
      .sort(byScoreThenId);
    return { ranked, epistemicStatus: 'EXACT' };
  }

  // 2. Substring match — kept EXACT for compat (see header doc).
  const substring: RankedNode[] = [];
  for (const n of nodes) {
    if (n.name.toLowerCase().includes(queryTerm)) {
      substring.push({ node: n, score: SUBSTRING_NAME_SCORE });
    } else if (n.qualifiedName.toLowerCase().includes(queryTerm)) {
      substring.push({ node: n, score: SUBSTRING_QNAME_SCORE });
    } else if (n.substrate.sourceLocation.filePath.toLowerCase().includes(queryTerm)) {
      substring.push({ node: n, score: SUBSTRING_PATH_SCORE });
    }
  }
  if (substring.length > 0) {
    substring.sort(byScoreThenId);
    return { ranked: substring, epistemicStatus: 'EXACT' };
  }

  // 3. Multi-signal fuzzy & token scoring.
  const stopWords = new Set(['how', 'to', 'in', 'the', 'a', 'an', 'of', 'for', 'with', 'and', 'or', 'at', 'by', 'on', 'is', 'it']);
  const rawTokens = queryTerm
    .replace(/[^a-z0-9_]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1 && !stopWords.has(t));

  const queryKeywords = rawTokens.length > 0 ? rawTokens : queryTerm.split(/\s+/);
  const scored: RankedNode[] = [];

  for (const node of nodes) {
    let score = 0;

    const nameParts = node.name
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .toLowerCase()
      .split(/[^a-z0-9]+/);
    const qnameParts = node.qualifiedName
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .toLowerCase()
      .split(/[^a-z0-9]+/);
    const allSymbolTokens = new Set([...nameParts, ...qnameParts]);

    for (const kw of queryKeywords) {
      if (allSymbolTokens.has(kw)) {
        score += 30;
      } else {
        for (const token of allSymbolTokens) {
          if (token.startsWith(kw) || kw.startsWith(token)) {
            score += 18;
          } else if (token.includes(kw)) {
            score += 10;
          }
        }
      }

      if (node.substrate.symbolSignature && node.substrate.symbolSignature.toLowerCase().includes(kw)) {
        score += 12;
      }

      if (node.substrate.sourceLocation.filePath.toLowerCase().includes(kw)) {
        score += 8;
      }

      if (node.substrate.rawDocstring && node.substrate.rawDocstring.toLowerCase().includes(kw)) {
        score += 15;
      }
      if (node.semantic.conceptualSummary && node.semantic.conceptualSummary.toLowerCase().includes(kw)) {
        score += 15;
      }
    }

    if (node.processFlow.isEntryPoint) {
      score += 2;
    }

    if (score > 0) {
      scored.push({ node, score });
    }
  }

  scored.sort(byScoreThenId);

  return {
    ranked: scored,
    epistemicStatus: 'PROVISIONAL_LOWER_BOUND',
  };
}

/**
 * Resolve a single symbol-or-id exactly or fuzzily, with parity across
 * explore / impact / trace. Direct id lookup wins (score 100, EXACT);
 * otherwise delegates to rankNodesFuzzy and returns the top hit.
 */
export function resolveSymbolExactOrFuzzy(
  symbolOrId: string,
  nodes: SuperNode[],
  store?: StoreLike
): ResolvedSymbol | null {
  const trimmed = symbolOrId.trim();
  if (!trimmed) return null;

  const direct =
    store?.getNode(trimmed) ??
    nodes.find((n) => n.id === trimmed) ??
    null;
  if (direct) return { node: direct, score: EXACT_SCORE, status: 'EXACT' };

  const result = rankNodesFuzzy(trimmed, nodes, store);
  const top = result.ranked[0];
  if (!top) return null;
  return { node: top.node, score: top.score, status: result.epistemicStatus };
}
