import type { GraphDeltaEnvelope, SuperNode } from '@pigeongraph/schema';
import { ClientGraphStore } from '../store/client-graph.js';

export class DualBufferReconciler {
  private activeStore: ClientGraphStore;
  private pendingSemanticPatches = new Map<string, Partial<SuperNode['semantic']>>();

  constructor(store: ClientGraphStore) {
    this.activeStore = store;
  }

  /**
   * Applies incoming AST Substrate stream diffs immediately.
   */
  public applySubstrateDelta(envelope: GraphDeltaEnvelope): { appliedMutations: number } {
    if (envelope.epochId < this.activeStore.getActiveEpoch() && envelope.reconcileMode === 'delta') {
      return { appliedMutations: 0 };
    }

    if (envelope.reconcileMode === 'reset_snapshot') {
      this.activeStore.clear();
    }

    this.activeStore.setActiveEpoch(envelope.epochId);

    // Pass 1: Upsert and delete nodes
    const nodeUpserts: SuperNode[] = [];
    let count = 0;

    for (const mutation of envelope.mutations) {
      count++;
      switch (mutation.type) {
        case 'NodeUpsert':
          this.activeStore.upsertNode(mutation.node, envelope.epochId);
          nodeUpserts.push(mutation.node);
          break;
        case 'NodeDelete':
          this.activeStore.removeNode(mutation.nodeId);
          break;
        case 'FileDelete':
          break;
      }
    }

    // Pass 2: Upsert all edges after all nodes in the batch exist
    for (const node of nodeUpserts) {
      for (const edge of node.substrate.outgoingEdges) {
        this.activeStore.upsertEdge(node.id, edge.targetId, edge, 'CONFIRMED');
      }
    }

    for (const mutation of envelope.mutations) {
      if (mutation.type === 'EdgeUpsert') {
        this.activeStore.upsertEdge(mutation.sourceId, mutation.targetId, mutation.edge, 'CONFIRMED');
      }
    }

    return { appliedMutations: count };
  }

  /**
   * Reconciles delayed Layer 2 semantic annotations into existing nodes.
   */
  public applySemanticPatch(
    nodeId: string,
    semanticPatch: Partial<SuperNode['semantic']>,
    epoch: number
  ): boolean {
    const existingNode = this.activeStore.getNode(nodeId);
    if (!existingNode) {
      this.pendingSemanticPatches.set(nodeId, semanticPatch);
      return false;
    }

    existingNode.semantic = {
      ...existingNode.semantic,
      ...semanticPatch,
      validityStatus: 'VALID',
    };
    existingNode.versioning.layerEpochs.semanticEpoch = epoch;

    this.activeStore.upsertNode(existingNode, epoch);
    return true;
  }

  public getStore(): ClientGraphStore {
    return this.activeStore;
  }
}
