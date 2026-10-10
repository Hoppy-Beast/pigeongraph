import type { SuperNode } from '@pigeongraph/schema';
import { ClientGraphStore } from '../store/client-graph.js';
import { fetchSpans } from './span-fetcher.js';
import { computeRisk } from './risk.js';
import { rankNodesFuzzy, type RankedNode } from './resolver.js';
import { buildQueryCacheKey, type QueryCache } from './query-cache.js';

export interface ExploreQueryInput {
  query: string;
  task_context?: string;
  symbol_anchor?: string;
  depth?: number;
  include_blast_radius?: boolean;
  limit?: number;
  offset?: number;
  token_budget?: number;
  include_spans?: boolean;
  include_semantic?: boolean;
  include_flows?: boolean;
  include_dispatches?: boolean;
  compact?: boolean;
  projectRoot?: string;
}

export interface SemanticContextEntry {
  uid: string;
  conceptualSummary?: string;
  implements_spec: Array<{ reqId: string; title?: string; status?: string }>;
  justified_by_adr: Array<{ adrId: string; title?: string; status?: string }>;
  confidence?: string;
}

export interface ExploreQueryResponse {
  query_summary: {
    query: string;
    resolved_anchor?: string;
    resolved_score?: number;
    alternatives?: Array<{ uid: string; score: number }>;
    epistemic_status: 'EXACT' | 'PROVISIONAL_LOWER_BOUND';
    total_graph_nodes_searched: number;
    duration_ms: number;
    cached?: boolean;
  };
  symbols: Array<{
    uid: string;
    name: string;
    kind: string;
    filePath: string;
    lineRange: [number, number];
    signature?: string;
    docstring?: string;
    community?: string;
  }>;
  execution_flows: {
    entry_points: Array<{
      type: string;
      route?: string;
      handler: string;
    }>;
    call_chains: Array<{
      chain_id: string;
      steps: Array<{ hop: number; symbol: string; action: string; edgeKind?: string; dispatchMechanism?: string }>;
    }>;
  };
  dynamic_dispatches: Array<{
    pattern: string;
    emitter: string;
    event?: string;
    listener: string;
    confidence: number;
  }>;
  blast_radius?: {
    risk_level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    risk_score: number;
    affected_files_count: number;
    affected_symbols_count: number;
    critical_breakages: string[];
    affected_files?: string[];
  };
  served_spans: Array<{
    filePath: string;
    ranges: Array<[number, number]>;
    content: string;
    token_count: number;
  }>;
  total_matches?: number;
  truncated?: boolean;
  next_offset?: number;
  semantic_context?: SemanticContextEntry[];
  /**
   * Task 6.1: actionable guidance set only when symbols is empty, so agents
   * retry `pigeongraph index` instead of permanently falling back to grep.
   */
  hint?: string;
}

/**
 * Builds the semantic context entry for the top anchor only (token-bounded).
 * Reads Layer 2 fields already on the SuperNode; never mutates reconcile state.
 * Returns undefined when the anchor carries no semantic links (no placeholders).
 */
function buildSemanticContext(anchor: SuperNode): SemanticContextEntry | undefined {
  const sem = anchor.semantic;
  const implEdges = anchor.substrate.outgoingEdges.filter((e) =>
    e.dispatchMechanism?.startsWith('IMPLEMENTS_SPEC:')
  );
  const adrEdges = anchor.substrate.outgoingEdges.filter((e) =>
    e.dispatchMechanism?.startsWith('JUSTIFIED_BY_ADR:')
  );

  const implements_spec: SemanticContextEntry['implements_spec'] = implEdges.map((e) => {
    const reqId = e.dispatchMechanism!.split(':').slice(1).join(':').trim();
    const assoc = sem.multimodalAssociations?.find((a) => e.targetId.includes(a.uri));
    return {
      reqId,
      ...(assoc?.title ? { title: assoc.title } : {}),
    };
  });

  const justified_by_adr: SemanticContextEntry['justified_by_adr'] = [
    ...(sem.adrReferences?.map((a) => ({ adrId: a.adrId, title: a.title, status: a.status })) ?? []),
  ];
  for (const e of adrEdges) {
    const adrId = e.dispatchMechanism!.split(':').slice(1).join(':').trim();
    if (!justified_by_adr.some((a) => a.adrId === adrId)) {
      justified_by_adr.push({ adrId });
    }
  }

  const hasContent =
    (sem.conceptualSummary?.length ?? 0) > 0 || implements_spec.length > 0 || justified_by_adr.length > 0;
  if (!hasContent) return undefined;

  const linkEdges = [...implEdges, ...adrEdges];
  const confidence =
    linkEdges.find((e) => e.confidence === 'EXTRACTED')?.confidence ?? linkEdges[0]?.confidence;

  return {
    uid: anchor.id,
    ...(sem.conceptualSummary ? { conceptualSummary: sem.conceptualSummary } : {}),
    implements_spec,
    justified_by_adr,
    ...(confidence ? { confidence } : {}),
  };
}

export class SuperGraphExploreEngine {
  private store: ClientGraphStore;
  private projectRoot: string;
  private cache?: QueryCache;

  constructor(store: ClientGraphStore, opts?: { projectRoot?: string; cache?: QueryCache }) {
    this.store = store;
    this.projectRoot = opts?.projectRoot ?? process.cwd();
    this.cache = opts?.cache;
  }

  /** Task 4.2: PIGEONGRAPH_LAZY_SPANS=1 defers span disk reads (non-blocking explore). */
  private isLazySpans(): boolean {
    return process.env.PIGEONGRAPH_LAZY_SPANS === '1';
  }

  public explore(input: ExploreQueryInput): ExploreQueryResponse {
    const start = performance.now();
    const epoch = this.store.getActiveEpoch();
    let cacheKey: string | undefined;
    if (this.cache) {
      this.cache.invalidateOnEpoch(epoch);
      cacheKey = buildQueryCacheKey(input, epoch);
      const hit = this.cache.get(cacheKey);
      if (hit) {
        const freshDuration = performance.now() - start;
        // Task 4.2: lazy mode strips cached spans too (no stale disk content).
        const lazy = this.isLazySpans();
        return {
          ...hit.response,
          ...(lazy ? { served_spans: [], truncated: false } : {}),
          query_summary: {
            ...hit.response.query_summary,
            duration_ms: Number(freshDuration.toFixed(2)),
            cached: true,
          },
        };
      }
    }
    const allNodes = this.store.getAllNodes();

    // 1. Resolve Anchor Symbol (shared resolver — parity with impact/trace)
    let ranked: RankedNode[] = [];
    let epistemicStatus: 'EXACT' | 'PROVISIONAL_LOWER_BOUND' = 'EXACT';

    if (input.symbol_anchor) {
      const exact = this.store.getNode(input.symbol_anchor);
      if (exact) ranked = [{ node: exact, score: 100 }];
    }

    if (ranked.length === 0) {
      const result = rankNodesFuzzy(input.query, allNodes, this.store);
      ranked = result.ranked;
      epistemicStatus = result.epistemicStatus;
    }

    const matchedNodes: SuperNode[] = ranked.map((r) => r.node);
    const anchor = matchedNodes[0];
    const resolvedAnchor = anchor?.id;
    const resolvedScore = ranked[0]?.score;
    const alternatives = ranked.slice(0, 3).map((r) => ({ uid: r.node.id, score: r.score }));

    // 2. Format Symbol Definitions (limit/offset pagination, default 5, max 20)
    const totalMatches = matchedNodes.length;
    const limit = Math.min(Math.max(input.limit ?? 5, 1), 20);
    const offset = Math.max(input.offset ?? 0, 0);
    const pagedNodes = matchedNodes.slice(offset, offset + limit);
    const symbols = pagedNodes.map((node) => ({
      uid: node.id,
      name: node.name,
      kind: node.kind,
      filePath: node.substrate.sourceLocation.filePath,
      lineRange: [node.substrate.sourceLocation.startLine, node.substrate.sourceLocation.endLine] as [number, number],
      signature: node.substrate.symbolSignature,
      docstring: node.substrate.rawDocstring,
      community: node.semantic.communityClusters[0]?.communityLabel,
    }));

    // 3. Execution Flows (In-neighbors / Out-neighbors)
    // Gated by include_flows (default true); compact skips.
    const entryPoints: ExploreQueryResponse['execution_flows']['entry_points'] = [];
    const callChains: ExploreQueryResponse['execution_flows']['call_chains'] = [];
    const includeFlows = input.compact !== true && input.include_flows !== false;

    const resolveRouteMechanism = (n: SuperNode): string | undefined => {
      for (const e of n.substrate.outgoingEdges) {
        if (e.kind === 'HANDLES_ROUTE' && e.dispatchMechanism) {
          return e.dispatchMechanism;
        }
      }
      const inNodes = this.store.getInNeighbors(n.id);
      for (const inN of inNodes) {
        const edge = inN.substrate.outgoingEdges.find((e) => e.targetId === n.id && e.kind === 'HANDLES_ROUTE');
        if (edge?.dispatchMechanism) {
          return edge.dispatchMechanism;
        }
      }
      return undefined;
    };

    if (anchor && includeFlows) {
      if (anchor.processFlow.isEntryPoint) {
        entryPoints.push({
          type: anchor.processFlow.entryPointType ?? 'ENTRY_POINT',
          route: resolveRouteMechanism(anchor),
          handler: anchor.qualifiedName,
        });
      }

      const inNeighbors = this.store.getInNeighbors(anchor.id);
      const outNeighbors = this.store.getOutNeighbors(anchor.id);

      for (const inNode of inNeighbors) {
        if (inNode.processFlow.isEntryPoint) {
          entryPoints.push({
            type: inNode.processFlow.entryPointType ?? 'ENTRY_POINT',
            route: resolveRouteMechanism(inNode),
            handler: inNode.qualifiedName,
          });
        }
      }

      const getEdgeInfo = (
        sourceId: string,
        targetId: string
      ): { kind?: string; dispatchMechanism?: string } => {
        const source = this.store.getNode(sourceId);
        const edge = source?.substrate.outgoingEdges.find((e) => e.targetId === targetId);
        if (!edge) return {};
        return { kind: edge.kind, dispatchMechanism: edge.dispatchMechanism };
      };

      // Reverse BFS: anchor -> ... -> entry (via in-neighbors), depth 5, max 2 shortest paths.
      const findUpstreamPaths = (anchorId: string, maxDepth = 5, maxPaths = 2): string[][] => {
        const collected: string[][] = [];
        const queue: string[][] = [[anchorId]];
        let guard = 0;
        while (queue.length > 0 && collected.length < maxPaths && guard < 200) {
          guard++;
          const path = queue.shift()!;
          const current = path[path.length - 1];
          const depth = path.length - 1;
          const node = this.store.getNode(current);
          if (depth > 0 && node?.processFlow.isEntryPoint) {
            collected.push([...path].reverse());
            continue;
          }
          if (depth >= maxDepth) continue;
          const neighbors = this.store
            .getInNeighbors(current)
            .map((n) => n.id)
            .sort();
          for (const nb of neighbors) {
            if (path.includes(nb)) continue;
            queue.push([...path, nb]);
          }
        }
        const anchorNode = this.store.getNode(anchorId);
        if (collected.length === 0 && anchorNode?.processFlow.isEntryPoint) {
          return [[anchorId]];
        }
        return collected;
      };

      // Forward BFS: anchor -> ... -> sink (via out-neighbors), depth 5, max 2 shortest sink paths.
      const findDownstreamPaths = (anchorId: string, maxDepth = 5, maxPaths = 2): string[][] => {
        const collected: string[][] = [];
        const queue: string[][] = [[anchorId]];
        let guard = 0;
        while (queue.length > 0 && collected.length < maxPaths && guard < 200) {
          guard++;
          const path = queue.shift()!;
          const current = path[path.length - 1];
          const depth = path.length - 1;
          if (depth >= maxDepth) {
            collected.push(path);
            continue;
          }
          const neighbors = this.store
            .getOutNeighbors(current)
            .map((n) => n.id)
            .filter((id) => !path.includes(id))
            .sort();
          if (neighbors.length === 0) {
            collected.push(path);
            continue;
          }
          for (const nb of neighbors) {
            queue.push([...path, nb]);
          }
        }
        return collected;
      };

      const upstreamPaths = findUpstreamPaths(anchor.id, 5, 2);
      const downstreamPaths = findDownstreamPaths(anchor.id, 5, 2);
      const upList = upstreamPaths.length > 0 ? upstreamPaths : [[anchor.id]];
      const downList = downstreamPaths.length > 0 ? downstreamPaths : [[anchor.id]];

      const combos: string[][] = [];
      for (const up of upList) {
        for (const down of downList) {
          combos.push([...up, ...down.slice(1)]);
        }
      }
      combos.sort((a, b) => a.length - b.length || a.join('|').localeCompare(b.join('|')));
      const seen = new Set<string>();
      const uniqueCombos: string[][] = [];
      for (const c of combos) {
        const key = c.join('->');
        if (!seen.has(key)) {
          seen.add(key);
          uniqueCombos.push(c);
        }
        if (uniqueCombos.length >= 3) break;
      }

      uniqueCombos.slice(0, 3).forEach((ids, chainIdx) => {
        const capped = ids.slice(0, 7);
        const steps = capped.map((id, hop) => {
          const node = this.store.getNode(id);
          const symbol = node?.qualifiedName ?? id;
          if (id === anchor.id) {
            const edge = hop > 0 ? getEdgeInfo(capped[hop - 1], id) : {};
            return {
              hop,
              symbol,
              action: 'ORIGIN' as const,
              ...(edge.kind ? { edgeKind: edge.kind } : {}),
              ...(edge.dispatchMechanism ? { dispatchMechanism: edge.dispatchMechanism } : {}),
            };
          }
          const prevId = hop > 0 ? capped[hop - 1] : undefined;
          const edge = prevId ? getEdgeInfo(prevId, id) : {};
          let action: string;
          if (hop === 0 && node?.processFlow.isEntryPoint) {
            action = 'ENTRY';
          } else if (edge.kind) {
            action = edge.kind;
          } else {
            action = 'CALLS';
          }
          return {
            hop,
            symbol,
            action,
            ...(edge.kind ? { edgeKind: edge.kind } : {}),
            ...(edge.dispatchMechanism ? { dispatchMechanism: edge.dispatchMechanism } : {}),
          };
        });
        callChains.push({
          chain_id: `flow_${anchor.name}_${String(chainIdx + 1).padStart(2, '0')}`,
          steps,
        });
      });

      // Fallback: isolated anchor with no combos (should not happen, but keep compat).
      if (callChains.length === 0 && outNeighbors.length > 0) {
        callChains.push({
          chain_id: `flow_${anchor.name}_01`,
          steps: [
            { hop: 0, symbol: anchor.qualifiedName, action: 'ORIGIN' },
            ...outNeighbors.slice(0, 4).map((outNode, idx) => ({
              hop: idx + 1,
              symbol: outNode.qualifiedName,
              action: 'CALLS',
            })),
          ],
        });
      }
    }

    // 4. Dynamic Dispatches (gated by include_dispatches; compact skips)
    const dynamicDispatches: ExploreQueryResponse['dynamic_dispatches'] = [];
    const includeDispatches = input.compact !== true && input.include_dispatches !== false;
    if (anchor && includeDispatches) {
      for (const edge of anchor.substrate.outgoingEdges) {
        if (edge.kind.startsWith('DYNAMIC_DISPATCH') || edge.kind === 'HANDLES_ROUTE') {
          dynamicDispatches.push({
            pattern: edge.kind,
            emitter: anchor.id,
            listener: edge.targetId,
            confidence: edge.confidenceScore,
          });
        }
      }

      const inNeighbors = this.store.getInNeighbors(anchor.id);
      for (const inNode of inNeighbors) {
        for (const edge of inNode.substrate.outgoingEdges) {
          if (edge.targetId === anchor.id && (edge.kind.startsWith('DYNAMIC_DISPATCH') || edge.kind === 'HANDLES_ROUTE')) {
            dynamicDispatches.push({
              pattern: edge.kind,
              emitter: inNode.id,
              listener: anchor.id,
              confidence: edge.confidenceScore,
            });
          }
        }
      }
    }

    // 5. Blast Radius & Risk Assessment (bidirectional: editing a shared util
    // must surface upstream callers as well as downstream callees).
    // Gated by include_blast_radius; compact skips.
    let blastRadius: ExploreQueryResponse['blast_radius'] = undefined;
    if (input.include_blast_radius !== false && input.compact !== true && anchor) {
      const blast = this.store.bfsBlastRadius(anchor.id, {
        maxDepth: input.depth ?? 3,
        direction: 'both',
      });
      const affectedFiles = new Set(blast.nodes.map((n) => n.substrate.sourceLocation.filePath));

      const { score: riskScore, level: riskLevel } = computeRisk(blast.nodes);

      blastRadius = {
        risk_level: riskLevel,
        risk_score: riskScore,
        affected_files_count: affectedFiles.size,
        affected_symbols_count: blast.nodes.length,
        critical_breakages: blast.nodes.slice(0, 3).map((n) => n.qualifiedName),
        affected_files: Array.from(affectedFiles),
      };
    }

    // 6. Served Spans (real source slices via span-fetcher; compact skips)
    // Task 4.2: PIGEONGRAPH_LAZY_SPANS=1 skips fetchSpans entirely (defers disk reads).
    const lazySpans = this.isLazySpans();
    const includeSpans = input.compact !== true && input.include_spans !== false && !lazySpans;
    const tokenBudget = input.token_budget ?? 800;
    const effectiveRoot = input.projectRoot ?? this.projectRoot;
    let servedSpans: ExploreQueryResponse['served_spans'] = [];
    let spansTruncated = false;
    if (includeSpans && symbols.length > 0) {
      const fetched = fetchSpans(
        symbols.map((sym) => ({ filePath: sym.filePath, lineRange: sym.lineRange })),
        { projectRoot: effectiveRoot, tokenBudget }
      );
      servedSpans = fetched.spans;
      spansTruncated = fetched.truncated;
    }

    const duration = performance.now() - start;

    // 7. Semantic Context (top anchor only, token-bounded; opt-out via include_semantic: false; compact skips)
    let semanticContext: SemanticContextEntry[] | undefined;
    if (input.include_semantic !== false && input.compact !== true && anchor) {
      const entry = buildSemanticContext(anchor);
      if (entry) semanticContext = [entry];
    }

    const response: ExploreQueryResponse = {
      query_summary: {
        query: input.query,
        resolved_anchor: resolvedAnchor,
        resolved_score: resolvedScore,
        alternatives,
        epistemic_status: epistemicStatus,
        total_graph_nodes_searched: allNodes.length,
        duration_ms: Number(duration.toFixed(2)),
        cached: false,
      },
      symbols,
      execution_flows: {
        entry_points: entryPoints,
        call_chains: callChains,
      },
      dynamic_dispatches: dynamicDispatches,
      blast_radius: blastRadius,
      served_spans: servedSpans,
      total_matches: totalMatches,
      truncated: spansTruncated,
      next_offset: offset + symbols.length,
      semantic_context: semanticContext,
    };

    // Task 6.1: empty results must tell the agent exactly what to do next.
    if (symbols.length === 0) {
      response.hint =
        allNodes.length === 0
          ? 'Empty graph — run `pigeongraph index` in the repo root, then retry your query.'
          : 'No match — check spelling or try a route path (e.g. `/api/login`); if the graph may be stale, run `pigeongraph index` in the repo root, then retry.';
    }

    if (this.cache && cacheKey && !this.isLazySpans()) {
      this.cache.set(cacheKey, response, epoch);
    }
    return response;
  }
}
