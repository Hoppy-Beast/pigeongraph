import type { SuperNode } from '@pigeongraph/schema';
import { ClientGraphStore } from '../store/client-graph.js';

export interface ImpactQueryInput {
  target_symbol: string;
  direction?: 'upstream' | 'downstream' | 'both';
  max_depth?: number;
}

export interface ImpactQueryResponse {
  target: string;
  direction: string;
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  risk_score: number;
  total_affected_nodes: number;
  affected_files: string[];
  affected_nodes: Array<{
    uid: string;
    name: string;
    kind: string;
    filePath: string;
    depth: number;
  }>;
}

export interface TraceQueryInput {
  from_symbol: string;
  to_symbol: string;
  cross_repo?: boolean;
}

export interface TraceQueryResponse {
  found: boolean;
  from: string;
  to: string;
  hop_count: number;
  path: Array<{
    hop: number;
    node_id: string;
    name: string;
    filePath: string;
  }>;
}

export class AnalyticalToolsEngine {
  private store: ClientGraphStore;

  constructor(store: ClientGraphStore) {
    this.store = store;
  }

  public calculateImpact(input: ImpactQueryInput): ImpactQueryResponse {
    const maxDepth = input.max_depth ?? 3;
    const direction = input.direction ?? 'downstream';
    const targetNode = this.resolveSymbol(input.target_symbol);

    if (!targetNode) {
      return {
        target: input.target_symbol,
        direction,
        risk_level: 'LOW',
        risk_score: 0,
        total_affected_nodes: 0,
        affected_files: [],
        affected_nodes: [],
      };
    }

    const blast = this.store.bfsBlastRadius(targetNode.id, maxDepth);
    const affectedFiles = Array.from(new Set(blast.nodes.map((n) => n.substrate.sourceLocation.filePath)));

    const riskScore = Math.min(1.0, (blast.nodes.length * 0.08) + (affectedFiles.length * 0.12));
    const riskLevel = riskScore > 0.7 ? 'CRITICAL' : riskScore > 0.45 ? 'HIGH' : riskScore > 0.2 ? 'MEDIUM' : 'LOW';

    return {
      target: targetNode.id,
      direction,
      risk_level: riskLevel,
      risk_score: Number(riskScore.toFixed(2)),
      total_affected_nodes: blast.nodes.length,
      affected_files: affectedFiles,
      affected_nodes: blast.nodes.map((n) => ({
        uid: n.id,
        name: n.name,
        kind: n.kind,
        filePath: n.substrate.sourceLocation.filePath,
        depth: blast.depthMap.get(n.id) ?? 0,
      })),
    };
  }

  public tracePath(input: TraceQueryInput): TraceQueryResponse {
    const fromNode = this.resolveSymbol(input.from_symbol);
    const toNode = this.resolveSymbol(input.to_symbol);

    if (!fromNode || !toNode) {
      return { found: false, from: input.from_symbol, to: input.to_symbol, hop_count: 0, path: [] };
    }

    const pathIds = this.store.findShortestPath(fromNode.id, toNode.id);
    if (!pathIds || pathIds.length === 0) {
      return { found: false, from: fromNode.id, to: toNode.id, hop_count: 0, path: [] };
    }

    const path = pathIds.map((id, idx) => {
      const node = this.store.getNode(id)!;
      return {
        hop: idx,
        node_id: node.id,
        name: node.name,
        filePath: node.substrate.sourceLocation.filePath,
      };
    });

    return {
      found: true,
      from: fromNode.id,
      to: toNode.id,
      hop_count: path.length - 1,
      path,
    };
  }

  private resolveSymbol(symbolOrId: string): SuperNode | null {
    const direct = this.store.getNode(symbolOrId);
    if (direct) return direct;

    const all = this.store.getAllNodes();
    const match = all.find(
      (n) => n.name === symbolOrId || n.qualifiedName === symbolOrId || n.id.endsWith(`#${symbolOrId}`)
    );
    return match ?? null;
  }
}
