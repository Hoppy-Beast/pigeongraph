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
    if (input.symbol_anchor) {
      const exact = this.store.getNode(input.symbol_anchor);
      if (exact) matchedNodes = [exact];
    }

    if (matchedNodes.length === 0) {
      matchedNodes = allNodes.filter(
        (n) =>
          n.name.toLowerCase().includes(queryTerm) ||
          n.qualifiedName.toLowerCase().includes(queryTerm) ||
          n.substrate.sourceLocation.filePath.toLowerCase().includes(queryTerm)
      );
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
        if (edge.kind.startsWith('DYNAMIC_DISPATCH')) {
          dynamicDispatches.push({
            pattern: edge.kind,
            emitter: anchor.id,
            listener: edge.targetId,
            confidence: edge.confidenceScore,
          });
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
        epistemic_status: 'EXACT',
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
}
