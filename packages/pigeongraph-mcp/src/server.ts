import { ClientGraphStore, DualBufferReconciler, SuperGraphExploreEngine, AnalyticalToolsEngine } from '@pigeongraph/client';
import { SubstrateDaemon } from '@pigeongraph/substrate';

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
    this.exploreEngine = new SuperGraphExploreEngine(this.store, { projectRoot: this.projectRoot });
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
        description: `CRITICAL: Primary codebase navigation and symbol discovery tool. ALWAYS call this FIRST before attempting to grep or crawl files.
Use this to find where any function, class, interface, method, route (e.g. '/exam', '/auth'), middleware (e.g. 'ProtectedRoute', 'CORSMiddleware'), or component is defined and used.
Returns exact file paths, line numbers, signatures, call chains, dynamic dispatches (EventEmitters, routes), and blast radius in a single turn.
PREFER this over grep/ripgrep for any code symbol, route, or architecture search. Use grep ONLY for raw string literals, comments, or non-code text.`,
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description:
                'Symbol name, route path, middleware, class, function, or natural language query (e.g., "ProtectedRoute", "/exam", "CORSMiddleware", "verifyToken", "how does login work?").',
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
            limit: {
              type: 'integer',
              description: 'Max symbols to return (default: 5, max: 20).',
              default: 5,
            },
            offset: {
              type: 'integer',
              description: 'Pagination offset into matched symbols (default: 0).',
              default: 0,
            },
            token_budget: {
              type: 'integer',
              description: 'Token budget for served_spans content (default: 800).',
              default: 800,
            },
            include_spans: {
              type: 'boolean',
              description: 'Include real source slices in served_spans (default: true).',
              default: true,
            },
            include_semantic: {
              type: 'boolean',
              description: 'Include Layer 2 semantic context for the anchor (default: true).',
              default: true,
            },
            include_flows: {
              type: 'boolean',
              description: 'Include execution flows entry_points/call_chains (default: true).',
              default: true,
            },
            include_dispatches: {
              type: 'boolean',
              description: 'Include dynamic dispatches (default: true).',
              default: true,
            },
            compact: {
              type: 'boolean',
              description: 'Compact mode: symbols + query_summary + pagination only (default: false).',
              default: false,
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'pigeongraph_impact',
        description: `Calculates blast radius and dependency risk for a symbol before modifying or refactoring it. Returns all upstream callers and downstream dependencies. Call this before editing or refactoring shared functions/classes.`,
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
        description: `Traces the direct execution path and call chain between two symbols across modules or files (e.g. from an API route or entry point to a database query).`,
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
            limit: { type: 'integer', default: 5 },
            offset: { type: 'integer', default: 0 },
            token_budget: { type: 'integer', default: 800 },
            include_spans: { type: 'boolean', default: true },
            include_semantic: { type: 'boolean', default: true },
            include_flows: { type: 'boolean', default: true },
            include_dispatches: { type: 'boolean', default: true },
            compact: { type: 'boolean', default: false },
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
          limit: typeof args.limit === 'number' ? args.limit : 5,
          offset: typeof args.offset === 'number' ? args.offset : 0,
          token_budget: typeof args.token_budget === 'number' ? args.token_budget : 800,
          include_spans: args.include_spans !== false,
          include_semantic: args.include_semantic !== false,
          include_flows: args.include_flows !== false,
          include_dispatches: args.include_dispatches !== false,
          compact: args.compact === true,
          projectRoot: typeof args.projectRoot === 'string' ? args.projectRoot : this.projectRoot,
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
            serverInfo: { name: 'pigeongraph-mcp', version: '1.0.7' },
            instructions: `You are equipped with PigeonGraph, a zero-latency code knowledge graph.
Always query PigeonGraph (pigeongraph_explore) first when:
- Finding where functions, classes, interfaces, routes (e.g. /exam), middleware (e.g. ProtectedRoute, CORSMiddleware), or components are defined.
- Understanding control flow, call chains, or dynamic dispatches.
- Assessing blast radius and refactoring risk.
Do NOT default to multi-turn grep or file searches for code symbols. PigeonGraph returns exact file paths, line numbers, call chains, and context in a single turn. Only use grep for raw string literals, regexes across text files, or comments.`,
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
