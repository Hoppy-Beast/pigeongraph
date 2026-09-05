import type { SuperNode } from '@pigeongraph/schema';
import { ClientGraphStore } from '../store/client-graph.js';

export interface ExploreQueryInput {
  query: string;
  task_context?: string;
  symbol_anchor?: string;
  depth?: number;
  include_blast_radius?: boolean;
  token_budget?: number;
}

export interface ExploreQueryResponse {
  query_summary: {
    query: string;
    resolved_anchor?: string;
    epistemic_status: 'EXACT' | 'PROVISIONAL_LOWER_BOUND';
    total_graph_nodes_searched: number;
    duration_ms: number;
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
      steps: Array<{ hop: number; symbol: string; action: string }>;
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
  };
  served_spans: Array<{
    filePath: string;
    ranges: Array<[number, number]>;
    content: string;
    token_count: number;
  }>;
}

export class SuperGraphExploreEngine {
  private store: ClientGraphStore;

  constructor(store: ClientGraphStore) {
    this.store = store;
  }

  public explore(input: ExploreQueryInput): ExploreQueryResponse {
    const start = performance.now();
    const queryTerm = input.query.toLowerCase().trim();
    const allNodes = this.store.getAllNodes();

    // 1. Resolve Anchor Symbol
    let matchedNodes: SuperNode[] = [];
    let epistemicStatus: 'EXACT' | 'PROVISIONAL_LOWER_BOUND' = 'EXACT';

    if (input.symbol_anchor) {
      const exact = this.store.getNode(input.symbol_anchor);
      if (exact) matchedNodes = [exact];
    }

    if (matchedNodes.length === 0) {
      const result = this.rankNodesFuzzy(input.query, allNodes);
      matchedNodes = result.ranked;
      epistemicStatus = result.epistemicStatus;
    }

    const anchor = matchedNodes[0];
    const resolvedAnchor = anchor?.id;

    // 2. Format Symbol Definitions
    const symbols = matchedNodes.slice(0, 5).map((node) => ({
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
    const entryPoints: ExploreQueryResponse['execution_flows']['entry_points'] = [];
    const callChains: ExploreQueryResponse['execution_flows']['call_chains'] = [];

    if (anchor) {
      if (anchor.processFlow.isEntryPoint) {
        entryPoints.push({
          type: anchor.processFlow.entryPointType ?? 'ENTRY_POINT',
          handler: anchor.qualifiedName,
        });
      }

      const inNeighbors = this.store.getInNeighbors(anchor.id);
      const outNeighbors = this.store.getOutNeighbors(anchor.id);

      for (const inNode of inNeighbors) {
        if (inNode.processFlow.isEntryPoint) {
          entryPoints.push({
            type: inNode.processFlow.entryPointType ?? 'ENTRY_POINT',
            handler: inNode.qualifiedName,
          });
        }
      }

      if (outNeighbors.length > 0) {
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

    // 4. Dynamic Dispatches
    const dynamicDispatches: ExploreQueryResponse['dynamic_dispatches'] = [];
    if (anchor) {
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

    // 5. Blast Radius & Risk Assessment
    let blastRadius: ExploreQueryResponse['blast_radius'] = undefined;
    if (input.include_blast_radius !== false && anchor) {
      const blast = this.store.bfsBlastRadius(anchor.id, input.depth ?? 3);
      const affectedFiles = new Set(blast.nodes.map((n) => n.substrate.sourceLocation.filePath));

      const riskScore = Math.min(1.0, (blast.nodes.length * 0.05) + (affectedFiles.size * 0.1));
      const riskLevel = riskScore > 0.75 ? 'CRITICAL' : riskScore > 0.5 ? 'HIGH' : riskScore > 0.25 ? 'MEDIUM' : 'LOW';

      blastRadius = {
        risk_level: riskLevel,
        risk_score: Number(riskScore.toFixed(2)),
        affected_files_count: affectedFiles.size,
        affected_symbols_count: blast.nodes.length,
        critical_breakages: blast.nodes.slice(0, 3).map((n) => n.qualifiedName),
      };
    }

    // 6. Served Spans
    const servedSpans: ExploreQueryResponse['served_spans'] = symbols.map((sym) => ({
      filePath: sym.filePath,
      ranges: [sym.lineRange],
      content: `// Source span: ${sym.name}\n${sym.signature ?? ''}`,
      token_count: Math.ceil((sym.signature?.length ?? 20) / 4),
    }));

    const duration = performance.now() - start;

    return {
      query_summary: {
        query: input.query,
        resolved_anchor: resolvedAnchor,
        epistemic_status: epistemicStatus,
        total_graph_nodes_searched: allNodes.length,
        duration_ms: Number(duration.toFixed(2)),
      },
      symbols,
      execution_flows: {
        entry_points: entryPoints,
        call_chains: callChains,
      },
      dynamic_dispatches: dynamicDispatches,
      blast_radius: blastRadius,
      served_spans: servedSpans,
    };
  }

  private rankNodesFuzzy(query: string, nodes: SuperNode[]): { ranked: SuperNode[]; epistemicStatus: 'EXACT' | 'PROVISIONAL_LOWER_BOUND' } {
    const queryTerm = query.toLowerCase().trim();
    if (!queryTerm) return { ranked: [], epistemicStatus: 'PROVISIONAL_LOWER_BOUND' };

    // 1. Direct exact match
    const exactMatches = nodes.filter(
      (n) => n.name.toLowerCase() === queryTerm || n.qualifiedName.toLowerCase() === queryTerm
    );
    if (exactMatches.length > 0) {
      return { ranked: exactMatches, epistemicStatus: 'EXACT' };
    }

    // Direct substring match
    const substringMatches = nodes.filter(
      (n) =>
        n.name.toLowerCase().includes(queryTerm) ||
        n.qualifiedName.toLowerCase().includes(queryTerm) ||
        n.substrate.sourceLocation.filePath.toLowerCase().includes(queryTerm)
    );
    if (substringMatches.length > 0) {
      return { ranked: substringMatches, epistemicStatus: 'EXACT' };
    }

    // 2. Multi-Signal Fuzzy & Token Scoring
    const stopWords = new Set(['how', 'to', 'in', 'the', 'a', 'an', 'of', 'for', 'with', 'and', 'or', 'at', 'by', 'on', 'is', 'it']);
    const rawTokens = queryTerm
      .replace(/[^a-z0-9_]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 1 && !stopWords.has(t));

    const queryKeywords = rawTokens.length > 0 ? rawTokens : queryTerm.split(/\s+/);
    const scoredNodes: Array<{ node: SuperNode; score: number }> = [];

    for (const node of nodes) {
      let score = 0;

      // Split camelCase & snake_case into tokens
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
        scoredNodes.push({ node, score });
      }
    }

    scoredNodes.sort((a, b) => b.score - a.score);

    return {
      ranked: scoredNodes.map((sn) => sn.node),
      epistemicStatus: 'PROVISIONAL_LOWER_BOUND',
    };
  }
}
