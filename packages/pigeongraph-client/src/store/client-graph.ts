import Graphology from 'graphology';
import type { SuperNode, SubstrateEdge } from '@pigeongraph/schema';

const MultiGraph = (Graphology as unknown as { MultiGraph?: typeof Graphology.MultiGraph; default?: { MultiGraph?: typeof Graphology.MultiGraph } }).MultiGraph ?? (Graphology as unknown as { default?: { MultiGraph?: typeof Graphology.MultiGraph } }).default?.MultiGraph ?? Graphology.MultiGraph ?? Graphology;

export interface ClientNodeAttributes {
  node: SuperNode;
  activeEpoch: number;
  isTombstoned?: boolean;
}

export interface ClientEdgeAttributes {
  edge: SubstrateEdge;
  source: string;
  target: string;
  provenance: string;
  status: 'PROVISIONAL' | 'CONFIRMED' | 'PROVISIONAL_RETAINED';
}

export class ClientGraphStore {
  // @ts-ignore
  private graph: any;
  private activeEpoch = 1;

  constructor() {
    // @ts-ignore
    this.graph = new MultiGraph();
  }

  public upsertNode(node: SuperNode, epoch: number): void {
    if (this.graph.hasNode(node.id)) {
      this.graph.setNodeAttribute(node.id, 'node', node);
      this.graph.setNodeAttribute(node.id, 'activeEpoch', epoch);
      this.graph.setNodeAttribute(node.id, 'isTombstoned', false);
    } else {
      this.graph.addNode(node.id, {
        node,
        activeEpoch: epoch,
        isTombstoned: false,
      });
    }
  }

  public removeNode(nodeId: string): void {
    if (this.graph.hasNode(nodeId)) {
      this.graph.dropNode(nodeId);
    }
  }

  public upsertEdge(
    sourceId: string,
    targetId: string,
    edge: SubstrateEdge,
    status: 'PROVISIONAL' | 'CONFIRMED' = 'CONFIRMED'
  ): void {
    if (!this.graph.hasNode(sourceId) || !this.graph.hasNode(targetId)) {
      return;
    }

    // Check if edge already exists
    const existingEdges = this.graph.edges(sourceId, targetId);
    let found = false;

    for (const edgeKey of existingEdges) {
      const attrs = this.graph.getEdgeAttributes(edgeKey) as ClientEdgeAttributes;
      if (attrs.edge.kind === edge.kind) {
        this.graph.setEdgeAttribute(edgeKey, 'edge', edge);
        this.graph.setEdgeAttribute(edgeKey, 'status', status);
        found = true;
        break;
      }
    }

    if (!found) {
      this.graph.addEdge(sourceId, targetId, {
        edge,
        source: sourceId,
        target: targetId,
        provenance: edge.provenance,
        status,
      });
    }
  }

  public getNode(nodeId: string): SuperNode | null {
    if (!this.graph.hasNode(nodeId)) return null;
    return this.graph.getNodeAttribute(nodeId, 'node') as SuperNode;
  }

  public getAllNodes(): SuperNode[] {
    return this.graph.nodes().map((id: string) => this.graph.getNodeAttribute(id, 'node') as SuperNode);
  }

  public getOutNeighbors(nodeId: string): SuperNode[] {
    if (!this.graph.hasNode(nodeId)) return [];
    return this.graph.outNeighbors(nodeId).map((id: string) => this.graph.getNodeAttribute(id, 'node') as SuperNode);
  }

  public getInNeighbors(nodeId: string): SuperNode[] {
    if (!this.graph.hasNode(nodeId)) return [];
    return this.graph.inNeighbors(nodeId).map((id: string) => this.graph.getNodeAttribute(id, 'node') as SuperNode);
  }

  public bfsBlastRadius(startNodeId: string, maxDepth = 3): {
    nodes: SuperNode[];
    edgeCount: number;
    depthMap: Map<string, number>;
  } {
    const visited = new Set<string>();
    const depthMap = new Map<string, number>();
    const queue: Array<{ id: string; depth: number }> = [{ id: startNodeId, depth: 0 }];
    visited.add(startNodeId);
    depthMap.set(startNodeId, 0);

    let edgeCount = 0;

    while (queue.length > 0) {
      const { id, depth } = queue.shift()!;
      if (depth >= maxDepth) continue;

      const outNeighbors = this.graph.hasNode(id) ? this.graph.outNeighbors(id) : [];
      for (const neighborId of outNeighbors) {
        edgeCount++;
        if (!visited.has(neighborId)) {
          visited.add(neighborId);
          depthMap.set(neighborId, depth + 1);
          queue.push({ id: neighborId, depth: depth + 1 });
        }
      }
    }

    const nodes = Array.from(visited)
      .map((id) => this.getNode(id))
      .filter((n): n is SuperNode => n !== null);

    return { nodes, edgeCount, depthMap };
  }

  public findShortestPath(fromId: string, toId: string): string[] | null {
    if (!this.graph.hasNode(fromId) || !this.graph.hasNode(toId)) return null;
    if (fromId === toId) return [fromId];

    const visited = new Set<string>();
    const parentMap = new Map<string, string>();
    const queue: string[] = [fromId];
    visited.add(fromId);

    while (queue.length > 0) {
      const curr = queue.shift()!;
      if (curr === toId) {
        // Reconstruct path
        const path: string[] = [];
        let step: string | undefined = toId;
        while (step) {
          path.unshift(step);
          step = parentMap.get(step);
        }
        return path;
      }

      const neighbors = this.graph.outNeighbors(curr);
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          parentMap.set(neighbor, curr);
          queue.push(neighbor);
        }
      }
    }

    return null;
  }

  public getActiveEpoch(): number {
    return this.activeEpoch;
  }

  public setActiveEpoch(epoch: number): void {
    this.activeEpoch = epoch;
  }

  public countNodes(): number {
    return this.graph.order;
  }

  public countEdges(): number {
    return this.graph.size;
  }

  public clear(): void {
    this.graph.clear();
  }
}
