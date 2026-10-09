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

export type BlastDirection = 'upstream' | 'downstream' | 'both';

export interface BlastRadiusOptions {
  maxDepth?: number;
  direction?: BlastDirection;
  edgeAllowlist?: string[];
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

  /**
   * Task 4.3: cascade-delete every node whose
   * `sourceLocation.filePath === filePath`. Graphology's `dropNode`
   * removes incident edges, so cross-file edges into/out of the
   * deleted file disappear with the nodes. Returns the removed count.
   */
  public removeNodesByFile(filePath: string): number {
    const victims: string[] = [];
    for (const id of this.graph.nodes()) {
      const node = this.graph.getNodeAttribute(id, 'node') as SuperNode | undefined;
      if (node?.substrate.sourceLocation.filePath === filePath) {
        victims.push(id);
      }
    }
    for (const id of victims) {
      this.graph.dropNode(id);
    }
    return victims.length;
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

  public bfsBlastRadius(
    startNodeId: string,
    maxDepthOrOptions: number | BlastRadiusOptions = 3
  ): {
    nodes: SuperNode[];
    edgeCount: number;
    depthMap: Map<string, number>;
  } {
    const opts: BlastRadiusOptions =
      typeof maxDepthOrOptions === 'number' ? { maxDepth: maxDepthOrOptions } : maxDepthOrOptions;
    const maxDepth = opts.maxDepth ?? 3;
    // Default downstream preserves pre-1.2 behavior for legacy numeric callers.
    const direction: BlastDirection = opts.direction ?? 'downstream';
    const allowlist = opts.edgeAllowlist ? new Set(opts.edgeAllowlist) : null;

    const visited = new Set<string>();
    const depthMap = new Map<string, number>();
    const queue: Array<{ id: string; depth: number }> = [{ id: startNodeId, depth: 0 }];
    // NOTE: start id is marked visited even when the node is missing (legacy
    // behavior); getNode() filters it out of `nodes` below.
    visited.add(startNodeId);
    depthMap.set(startNodeId, 0);

    let edgeCount = 0;

    const neighborsOf = (id: string): string[] => {
      if (!this.graph.hasNode(id)) return [];
      if (direction === 'downstream') return this.graph.outNeighbors(id);
      if (direction === 'upstream') return this.graph.inNeighbors(id);
      return Array.from(new Set([...this.graph.outNeighbors(id), ...this.graph.inNeighbors(id)]));
    };

    // Edge-kind-filtered traversal; counts each traversed edge individually.
    const traverseAllowedEdges = (id: string, depth: number): void => {
      if (!this.graph.hasNode(id)) return;
      const visit = (edgeKeys: string[], neighborOf: (attrs: ClientEdgeAttributes) => string) => {
        for (const key of edgeKeys) {
          const attrs = this.graph.getEdgeAttributes(key) as ClientEdgeAttributes;
          if (!allowlist!.has(attrs.edge.kind)) continue;
          edgeCount++;
          const neighborId = neighborOf(attrs);
          if (!visited.has(neighborId)) {
            visited.add(neighborId);
            depthMap.set(neighborId, depth + 1);
            queue.push({ id: neighborId, depth: depth + 1 });
          }
        }
      };
      if (direction === 'downstream' || direction === 'both') {
        visit(this.graph.outEdges(id), (attrs) => attrs.target);
      }
      if (direction === 'upstream' || direction === 'both') {
        visit(this.graph.inEdges(id), (attrs) => attrs.source);
      }
    };

    while (queue.length > 0) {
      const { id, depth } = queue.shift()!;
      if (depth >= maxDepth) continue;

      if (allowlist) {
        traverseAllowedEdges(id, depth);
        continue;
      }
      for (const neighborId of neighborsOf(id)) {
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
