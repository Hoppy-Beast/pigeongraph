import { ClientGraphStore, DualBufferReconciler, SuperGraphExploreEngine, AnalyticalToolsEngine } from '@supergraph/client';
import { SubstrateDaemon } from '@supergraph/substrate';

export interface McpServerOptions {
  projectRoot: string;
  repoId: string;
  daemon?: SubstrateDaemon;
  store?: ClientGraphStore;
}

export class SuperGraphMcpServer {
  private store: ClientGraphStore;
  private exploreEngine: SuperGraphExploreEngine;
  private analyticalEngine: AnalyticalToolsEngine;
  private reconciler: DualBufferReconciler;
  private projectRoot: string;
  private repoId: string;

  constructor(options: McpServerOptions) {
    this.projectRoot = options.projectRoot;
    this.repoId = options.repoId;
    this.store = options.store ?? new ClientGraphStore();
    this.reconciler = new DualBufferReconciler(this.store);
    this.exploreEngine = new SuperGraphExploreEngine(this.store);
    this.analyticalEngine = new AnalyticalToolsEngine(this.store);

    if (options.daemon) {
      const existing = options.daemon.db.getAllNodes();
      for (const node of existing) {
        this.store.upsertNode(node, 1);
        for (const edge of node.substrate.outgoingEdges) {
          this.store.upsertEdge(node.id, edge.targetId, edge);
        }
      }
    }
  }

  public getToolDefinitions(): Array<{ name: string; description: string; inputSchema: object }> {
    return [
      {
        name: 'pigeongraph_explore',
        description: `Primary 1-shot architectural navigation tool. Explores code symbols, execution flows, dynamic dispatches, blast radius, and served spans in a single turn. Replaces multi-turn file crawling and grepping.`,
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Natural language question, keyword, or symbol name (e.g., "verifyToken", "how does login work?").',
            },
            task_context: {
              type: 'string',
              description: 'High-level objective or context for the query.',
            },
            symbol_anchor: {
              type: 'string',
              description: 'Optional qualified symbol UID or name to anchor graph traversal.',
            },
            depth: {
              type: 'integer',
              description: 'Traversal depth for blast radius (default: 3).',
              default: 3,
            },
            include_blast_radius: {
              type: 'boolean',
              description: 'Include risk-weighted blast radius summary (default: true).',
              default: true,
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'pigeongraph_impact',
        description: `Calculates detailed multi-axis blast radius for refactoring and risk assessment.`,
        inputSchema: {
          type: 'object',
          properties: {
            target_symbol: {
              type: 'string',
              description: 'Symbol name or qualified UID to analyze.',
            },
            direction: {
              type: 'string',
              enum: ['upstream', 'downstream', 'both'],
              default: 'downstream',
            },
            max_depth: {
              type: 'integer',
              default: 3,
            },
          },
          required: ['target_symbol'],
        },
      },
      {
        name: 'pigeongraph_trace',
        description: `Traces the shortest directed execution path between two symbols across modules or repos.`,
        inputSchema: {
          type: 'object',
          properties: {
            from_symbol: { type: 'string', description: 'Starting symbol name or UID.' },
            to_symbol: { type: 'string', description: 'Destination symbol name or UID.' },
          },
          required: ['from_symbol', 'to_symbol'],
        },
      },
      // Backward compatibility alias
      {
        name: 'supergraph_explore',
        description: `Alias for pigeongraph_explore.`,
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string' },
            task_context: { type: 'string' },
            symbol_anchor: { type: 'string' },
            depth: { type: 'integer', default: 3 },
            include_blast_radius: { type: 'boolean', default: true },
          },
          required: ['query'],
        },
      },
    ];
  }

  public handleToolCall(toolName: string, args: Record<string, unknown>): unknown {
    switch (toolName) {
      case 'pigeongraph_explore':
      case 'supergraph_explore':
        return this.exploreEngine.explore({
          query: String(args.query ?? ''),
          task_context: args.task_context ? String(args.task_context) : undefined,
          symbol_anchor: args.symbol_anchor ? String(args.symbol_anchor) : undefined,
          depth: typeof args.depth === 'number' ? args.depth : 3,
          include_blast_radius: args.include_blast_radius !== false,
        });

      case 'pigeongraph_impact':
      case 'supergraph_impact':
        return this.analyticalEngine.calculateImpact({
          target_symbol: String(args.target_symbol ?? ''),
          direction: args.direction as any,
          max_depth: typeof args.max_depth === 'number' ? args.max_depth : 3,
        });

      case 'pigeongraph_trace':
      case 'supergraph_trace':
        return this.analyticalEngine.tracePath({
          from_symbol: String(args.from_symbol ?? ''),
          to_symbol: String(args.to_symbol ?? ''),
        });

      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }

  public handleJsonRpcMessage(messageStr: string): string | null {
    try {
      const msg = JSON.parse(messageStr);
      const id = msg.id;

      if (msg.method === 'initialize') {
        return JSON.stringify({
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: '2024-11-05',
            serverInfo: { name: 'pigeongraph-mcp', version: '1.0.0' },
            capabilities: { tools: {} },
          },
        });
      }

      if (msg.method === 'tools/list') {
        return JSON.stringify({
          jsonrpc: '2.0',
          id,
          result: { tools: this.getToolDefinitions() },
        });
      }

      if (msg.method === 'tools/call') {
        const toolName = msg.params?.name;
        const toolArgs = msg.params?.arguments ?? {};
        try {
          const result = this.handleToolCall(toolName, toolArgs);
          return JSON.stringify({
            jsonrpc: '2.0',
            id,
            result: {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            },
          });
        } catch (err: any) {
          return JSON.stringify({
            jsonrpc: '2.0',
            id,
            error: { code: -32603, message: err.message ?? 'Internal error' },
          });
        }
      }

      if (id !== undefined) {
        return JSON.stringify({
          jsonrpc: '2.0',
          id,
          error: { code: -32601, message: `Method not found: ${msg.method}` },
        });
      }

      return null;
    } catch {
      return JSON.stringify({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32700, message: 'Parse error' },
      });
    }
  }

  public getStore(): ClientGraphStore {
    return this.store;
  }
}
