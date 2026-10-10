import { ClientGraphStore, DualBufferReconciler, SuperGraphExploreEngine, AnalyticalToolsEngine, WorkingSet } from '@pigeongraph/client';
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
  private workingSet: WorkingSet;

  constructor(options: McpServerOptions) {
    this.projectRoot = options.projectRoot;
    this.repoId = options.repoId;
    this.store = options.store ?? new ClientGraphStore();
    this.reconciler = new DualBufferReconciler(this.store);
    this.exploreEngine = new SuperGraphExploreEngine(this.store, { projectRoot: this.projectRoot });
    this.analyticalEngine = new AnalyticalToolsEngine(this.store);
    this.workingSet = new WorkingSet();

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
Pagination: limit (default 5, max 20) + offset page through matches; next_offset/total_matches continue paging.
Use token_budget with include_spans to bound served_spans source slices; toggles include_semantic/include_flows/include_dispatches/include_blast_radius trim sections; compact=true returns symbols + query_summary + pagination only (skips flows, dispatches, blast_radius, spans, semantic_context).
query_summary reports resolved_anchor, resolved_score (0-100), alternatives (top-3 uid+score), epistemic_status, and cached (true on query-cache hit); semantic_context carries Layer 2 spec/ADR links for the anchor when present.
Recent anchors auto-record to the observational working-set; inspect via pigeongraph_context get/clear — explore never short-circuits on memory.
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
      {
        name: 'pigeongraph_context',
        description: `Observational working-set session memory digest (LRU, max 50 anchors keyed by query+anchor, staleness via H_semantic_inv). 'get' returns the most recent entries (max 10, <500 tokens total, each with query/anchor/score/symbols/risk/hits); 'clear' empties the memory. Recording happens automatically on every pigeongraph_explore/pigeongraph_impact (repeat query bumps hits); this tool never recomputes graph state and explore never short-circuits on memory.`,
        inputSchema: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: ['get', 'clear'],
              description: 'get returns the digest, clear empties it.',
            },
          },
          required: ['action'],
        },
      },
      // Backward compatibility alias
      {
        name: 'supergraph_explore',
        description: `Alias for pigeongraph_explore. Supports limit/offset pagination, token_budget/include_spans, include_semantic/include_flows/include_dispatches toggles, and compact mode; query_summary reports resolved_score/alternatives/cached and semantic_context carries Layer 2 links.`,
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Symbol name, route path, or natural language query.' },
            task_context: { type: 'string', description: 'High-level objective or context for the query.' },
            symbol_anchor: { type: 'string', description: 'Optional qualified symbol UID or name to anchor graph traversal.' },
            depth: { type: 'integer', description: 'Traversal depth for blast radius (default: 3).', default: 3 },
            include_blast_radius: { type: 'boolean', description: 'Include risk-weighted blast radius summary (default: true).', default: true },
            limit: { type: 'integer', description: 'Max symbols to return (default: 5, max: 20).', default: 5 },
            offset: { type: 'integer', description: 'Pagination offset into matched symbols (default: 0).', default: 0 },
            token_budget: { type: 'integer', description: 'Token budget for served_spans content (default: 800).', default: 800 },
            include_spans: { type: 'boolean', description: 'Include real source slices in served_spans (default: true).', default: true },
            include_semantic: { type: 'boolean', description: 'Include Layer 2 semantic context for the anchor (default: true).', default: true },
            include_flows: { type: 'boolean', description: 'Include execution flows entry_points/call_chains (default: true).', default: true },
            include_dispatches: { type: 'boolean', description: 'Include dynamic dispatches (default: true).', default: true },
            compact: { type: 'boolean', description: 'Compact mode: symbols + query_summary + pagination only (default: false).', default: false },
          },
          required: ['query'],
        },
      },
    ];
  }

  public handleToolCall(toolName: string, args: Record<string, unknown>): unknown {
    switch (toolName) {
      case 'pigeongraph_explore':
      case 'supergraph_explore': {
        const query = String(args.query ?? '');
        const result = this.exploreEngine.explore({
          query,
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
        // Observational only: always return the fresh result (no short-circuit).
        this.recordExplore(query, result as {
          query_summary: { resolved_anchor?: string; resolved_score?: number };
          symbols: unknown[];
          blast_radius?: { risk_level?: string };
        });
        return result;
      }

      case 'pigeongraph_impact':
      case 'supergraph_impact': {
        const targetSymbol = String(args.target_symbol ?? '');
        const result = this.analyticalEngine.calculateImpact({
          target_symbol: targetSymbol,
          direction: args.direction as any,
          max_depth: typeof args.max_depth === 'number' ? args.max_depth : 3,
        });
        this.recordImpact(targetSymbol, result as {
          target: string;
          risk_level?: string;
          total_affected_nodes: number;
        });
        return result;
      }

      case 'pigeongraph_trace':
      case 'supergraph_trace':
        return this.analyticalEngine.tracePath({
          from_symbol: String(args.from_symbol ?? ''),
          to_symbol: String(args.to_symbol ?? ''),
        });

      case 'pigeongraph_context': {
        const action = String(args.action ?? 'get');
        if (action === 'clear') {
          this.workingSet.clear();
          return { action: 'clear', cleared: true, count: 0 };
        }
        if (action === 'get') {
          const entries = this.workingSet.list(10).map((e) => ({
            query: e.query.slice(0, 60),
            anchor: e.anchorId.slice(0, 100),
            ...(e.summary.resolved_score !== undefined ? { score: e.summary.resolved_score } : {}),
            symbols: e.summary.symbols_count,
            ...(e.summary.risk_level !== undefined ? { risk: e.summary.risk_level } : {}),
            hits: e.hits,
          }));
          return {
            action: 'get',
            count: this.workingSet.size,
            entries,
            truncated: this.workingSet.size > entries.length,
          };
        }
        throw new Error(`Unknown action for pigeongraph_context: ${action}`);
      }

      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }

  /** Observational record of a fresh explore result; never alters the result. */
  private recordExplore(
    query: string,
    result: {
      query_summary: { resolved_anchor?: string; resolved_score?: number };
      symbols: unknown[];
      blast_radius?: { risk_level?: string };
    }
  ): void {
    const anchorId = result.query_summary.resolved_anchor;
    if (!anchorId) return;
    const anchorNode = this.store.getNode(anchorId);
    if (!anchorNode) return;
    this.workingSet.record(query, anchorNode, {
      resolved_anchor: anchorId,
      ...(result.query_summary.resolved_score !== undefined
        ? { resolved_score: result.query_summary.resolved_score }
        : {}),
      symbols_count: result.symbols.length,
      ...(result.blast_radius?.risk_level !== undefined ? { risk_level: result.blast_radius.risk_level } : {}),
    });
  }

  /** Observational record of an impact result; never alters the result. */
  private recordImpact(
    targetSymbol: string,
    result: { target: string; risk_level?: string; total_affected_nodes: number }
  ): void {
    const anchorNode = this.store.getNode(result.target);
    if (!anchorNode) return;
    this.workingSet.record(targetSymbol, anchorNode, {
      resolved_anchor: result.target,
      symbols_count: result.total_affected_nodes,
      ...(result.risk_level !== undefined ? { risk_level: result.risk_level } : {}),
    });
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
            serverInfo: { name: 'pigeongraph-mcp', version: '1.1.0' },
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

  public getWorkingSet(): WorkingSet {
    return this.workingSet;
  }
}
