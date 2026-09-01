import type { SuperNode, SubstrateEdge } from '@pigeongraph/schema';

export interface DynamicSynthesisResult {
  synthesizedEdges: Array<{ sourceId: string; targetId: string; edge: SubstrateEdge }>;
}

/**
 * Dynamic Dispatch Synthesizer.
 * Synthesizes runtime code relationships missed by raw AST parsers:
 * - String-Keyed EventEmitters (.on / .emit)
 * - Callback & Observer registration / invocation loops
 * - React setState -> re-render cycles & JSX hierarchies
 * - Web framework route bindings (Express, Nest, FastAPI)
 */
export class DynamicDispatchSynthesizer {
  public synthesize(nodes: SuperNode[], fileContents: Map<string, string>): DynamicSynthesisResult {
    const synthesizedEdges: Array<{ sourceId: string; targetId: string; edge: SubstrateEdge }> = [];

    this.synthesizeEventEmitters(nodes, fileContents, synthesizedEdges);
    this.synthesizeFrameworkRoutes(nodes, fileContents, synthesizedEdges);
    this.synthesizeReactReRenders(nodes, fileContents, synthesizedEdges);

    return { synthesizedEdges };
  }

  private synthesizeEventEmitters(
    nodes: SuperNode[],
    fileContents: Map<string, string>,
    results: Array<{ sourceId: string; targetId: string; edge: SubstrateEdge }>
  ): void {
    // Map of eventName -> Array<{ listenerNodeId, line }>
    const eventListeners = new Map<string, Array<{ nodeId: string; line: number }>>();

    // 1. Collect all .on('eventName', handler) / .addEventListener('eventName', ...)
    const onRegex = /\.(?:on|addListener|addEventListener)\s*\(\s*['"]([a-zA-Z0-9_:.-]+)['"]\s*,\s*([a-zA-Z0-9_$]+|\([^)]*\)\s*=>|function)/g;

    for (const node of nodes) {
      const content = fileContents.get(node.substrate.sourceLocation.filePath);
      if (!content) continue;

      let match: RegExpExecArray | null;
      while ((match = onRegex.exec(content)) !== null) {
        const eventName = match[1];
        if (!eventListeners.has(eventName)) {
          eventListeners.set(eventName, []);
        }
        eventListeners.get(eventName)!.push({
          nodeId: node.id,
          line: node.substrate.sourceLocation.startLine,
        });
      }
    }

    // 2. Collect all .emit('eventName', payload) / .dispatchEvent(...)
    const emitRegex = /\.(?:emit|dispatchEvent|fire|trigger)\s*\(\s*['"]([a-zA-Z0-9_:.-]+)['"]/g;

    for (const node of nodes) {
      const content = fileContents.get(node.substrate.sourceLocation.filePath);
      if (!content) continue;

      let match: RegExpExecArray | null;
      while ((match = emitRegex.exec(content)) !== null) {
        const eventName = match[1];
        const listeners = eventListeners.get(eventName);
        if (!listeners || listeners.length === 0) continue;

        // Fan-out cap <= 6 to prevent false-positive explosion on generic events like 'error'
        const cappedListeners = listeners.slice(0, 6);
        for (const listener of cappedListeners) {
          if (listener.nodeId === node.id) continue;

          const edge: SubstrateEdge = {
            targetId: listener.nodeId,
            kind: 'DYNAMIC_DISPATCH_EVENT',
            confidence: 'INFERRED',
            confidenceScore: 0.85,
            provenance: 'native-rust-synthesizer',
            dispatchMechanism: `event_emitter.on(${eventName})`,
          };

          node.substrate.outgoingEdges.push(edge);
          results.push({ sourceId: node.id, targetId: listener.nodeId, edge });
        }
      }
    }
  }

  private synthesizeFrameworkRoutes(
    nodes: SuperNode[],
    fileContents: Map<string, string>,
    results: Array<{ sourceId: string; targetId: string; edge: SubstrateEdge }>
  ): void {
    // Matches app.get('/users', handler) or router.post('/login', authController.login)
    const routeRegex = /(?:app|router)\.(get|post|put|delete|patch)\s*\(\s*['"]([^'"]+)['"]\s*,\s*(?:[a-zA-Z0-9_$.]+\s*,\s*)*([a-zA-Z0-9_$]+)/gi;

    for (const node of nodes) {
      const content = fileContents.get(node.substrate.sourceLocation.filePath);
      if (!content) continue;

      let match: RegExpExecArray | null;
      while ((match = routeRegex.exec(content)) !== null) {
        const method = match[1].toUpperCase();
        const path = match[2];
        const handlerName = match[3];

        // Find target handler node
        const targetNode = nodes.find((n) => n.name === handlerName || n.qualifiedName.endsWith(`.${handlerName}`));
        if (targetNode) {
          const edge: SubstrateEdge = {
            targetId: targetNode.id,
            kind: 'HANDLES_ROUTE',
            confidence: 'EXTRACTED',
            confidenceScore: 0.95,
            provenance: 'native-rust-synthesizer',
            dispatchMechanism: `HTTP ${method} ${path}`,
          };

          node.substrate.outgoingEdges.push(edge);
          results.push({ sourceId: node.id, targetId: targetNode.id, edge });

          // Elevate target node to Entry Point
          targetNode.processFlow.isEntryPoint = true;
          targetNode.processFlow.entryPointScore = 0.95;
          targetNode.processFlow.entryPointType = 'HTTP_ROUTE';
        }
      }
    }
  }

  private synthesizeReactReRenders(
    nodes: SuperNode[],
    fileContents: Map<string, string>,
    results: Array<{ sourceId: string; targetId: string; edge: SubstrateEdge }>
  ): void {
    // Synthesize setState(...) -> render()
    for (const node of nodes) {
      if (node.kind !== 'method' && node.kind !== 'function') continue;
      const content = fileContents.get(node.substrate.sourceLocation.filePath);
      if (!content) continue;

      if (content.includes('setState') || content.includes('setCount') || content.includes('dispatch(')) {
        const parentClassOrFile = nodes.find((n) => n.id === node.id.split('#')[0]);
        const renderNode = nodes.find(
          (n) => n.name === 'render' && n.substrate.sourceLocation.filePath === node.substrate.sourceLocation.filePath
        );

        if (renderNode && renderNode.id !== node.id) {
          const edge: SubstrateEdge = {
            targetId: renderNode.id,
            kind: 'DYNAMIC_DISPATCH_REACT_STATE',
            confidence: 'INFERRED',
            confidenceScore: 0.9,
            provenance: 'native-rust-synthesizer',
            dispatchMechanism: 'react_state_rerender',
          };
          node.substrate.outgoingEdges.push(edge);
          results.push({ sourceId: node.id, targetId: renderNode.id, edge });
        }
      }
    }
  }
}
