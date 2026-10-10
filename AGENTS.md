# AGENTS.md: PigeonGraph contributor and architecture guide

This document outlines the architecture, package boundaries, and validation workflows for agents and developers working on PigeonGraph.

---

## Architecture invariants

1. Clean-room MIT licensing:
   - Do not import, copy, or adapt code from proprietary, copyleft (GPL), or commercially restricted projects (such as GitNexus / PolyForm Noncommercial).
   - Zero external C++ or Python runtime compilation dependencies. PigeonGraph runs as native TypeScript and Node.js.

2. Deterministic Layer 1 (zero token cost):
   - Layer 1 (Substrate AST extraction, dynamic dispatch synthesis, SQLite WAL) is deterministic and uses 0 LLM tokens.
   - Do not add probabilistic models or LLM calls to Substrate.

3. Triple-invariant hashes:
   - Each SuperNode contains versioning clocks and three deterministic hashes:
     - `H_content`: SHA-256 byte digest of raw source text.
     - `H_ast`: Normalized AST syntax subtree digest.
     - `H_semantic_inv`: Public interface and visibility signature hash.
   - Rule: Internal implementation changes that preserve exported types and signatures must not alter `H_semantic_inv`.

4. Test requirements:
   - Add unit tests in `packages/*/test/` for all parsers, synthesizers, client methods, and CLI commands.
   - Run the full test suite before finishing changes.

5. Context boundaries:
   - This document defines repository-level engineering rules. It operates alongside any system-level directives without conflict.

---

## Monorepo package topology

The repository is organized into five layers under `packages/`:

```text
packages/
├── pigeongraph-schema/     # Layer 0: JSON Schema Draft 2020-12, invariant hashes, AJV, clocks
├── pigeongraph-substrate/  # Layer 1: Universal AST parser, dynamic synthesizers, SQLite WAL, WebSocket streamer
├── pigeongraph-semantic/   # Layer 2: Async SQLite queue, prompt defanger, ADR and Markdown synthesizer
├── pigeongraph-client/     # Layer 3: In-memory Graphology store, dual-buffer reconciler, explore engine
└── pigeongraph-mcp/        # Consumer: Stdio JSON-RPC MCP server, CLI (pigeongraph), live web visualizer
```

### Dependency flow

Dependencies flow strictly downward:
`mcp` -> `client` -> `semantic` -> `substrate` -> `schema`

Do not introduce circular dependencies across package boundaries.

---

## Verification and commands

Node.js >= 22.5.0 is required for native SQLite (`node:sqlite` `DatabaseSync`). Node 24 LTS is recommended.

```bash
# 1. Build all packages (TypeScript project references)
npm run build

# 2. Run the complete test suite (46 tests across 10 suites)
npm test

# 3. Run benchmarks across test repositories
npm run bench

# 4. Query the repository architecture
node packages/pigeongraph-mcp/dist/cli.js explore "<query>"

# 5. Start the web visualizer
node packages/pigeongraph-mcp/dist/cli.js ui --port 5052

# 6. Audit PR blast radius against a base commit
node packages/pigeongraph-mcp/dist/cli.js audit-pr --base HEAD~1 --head HEAD
```

---

## Codebase exploration

<!-- pigeongraph-guidance -->
## 🐦 Code Navigation & Architecture with PigeonGraph

### Protocol: Prefer PigeonGraph over Grep / File Crawling
When exploring or modifying this codebase, **ALWAYS call PigeonGraph first** before using `grep`, `grep_search`, `find`, `find_by_name`, or reading multiple whole files.

#### 1. When to use PigeonGraph (`pigeongraph_explore` / `pigeongraph explore "<query>"`):
- **Symbol & Token Discovery**: Finding where functions, classes, interfaces, types, methods, models, routes (e.g. `/exam`, `/api/orders`), middleware (e.g. `ProtectedRoute`, `CORSMiddleware`), or components are declared and used.
- **Architectural Flow**: Questions like "How does auth work?", "Where is payment handled?", "Trace execution from route to database".
- **Call Chains & Dependencies**: Finding who calls a function, or what a function calls.
- **Dynamic Dispatches**: Tracing `EventEmitter` events (`.emit` -> `.on`), HTTP routes to controller handlers, and React state triggers.
- **Blast Radius & Impact**: Assessing refactoring risks before editing code (use `pigeongraph_impact`).

#### 2. Why PigeonGraph Beats Grep:
- **1-Turn Resolution vs. Multi-Turn Crawling**: In 1 shot, PigeonGraph returns exact file paths, line ranges, signatures, callers, callees, dynamic dispatches, and blast radius.
- **Semantic Precision**: Grep returns hundreds of noisy lines (imports, comments, string literals). PigeonGraph resolves the actual symbol and its relationships.
- **Zero Token Waste**: Eliminates blindly loading entire files into context just to find a function definition.

#### 3. When to use Grep / Find instead:
- Searching for raw non-code string literals (e.g., specific error messages, CSS classes, UI copy, regex patterns in .env/markdown).
- Searching for regex patterns across non-code files.
- PigeonGraph returned 0 results for a symbol.
- If PigeonGraph returns 0 results: run `pigeongraph index` in the repo root, retry the query once, and only then fall back to grep.

#### 4. Efficiency flags + working-set memory:
- `pigeongraph_explore` supports `limit`/`offset` pagination (`next_offset`/`total_matches`), `token_budget` + `include_spans` for bounded source slices, `include_semantic`/`include_flows`/`include_dispatches`/`include_blast_radius` toggles, and `compact:true` for symbols + `query_summary` + pagination only (skips flows/dispatches/blast_radius/spans/`semantic_context`).
- `query_summary` carries `resolved_anchor`/`resolved_score`/`alternatives`/`cached`; `semantic_context` carries Layer 2 spec/ADR links when present.
- Recent anchors auto-record to the observational working-set; inspect via `pigeongraph_context` (`get` returns max 10 entries, <500 tokens; `clear` empties). Explore never short-circuits on memory.
<!-- /pigeongraph-guidance -->

---

## Security and prompt defanging

When processing markdown specifications or user code in Layer 2:
- Route untrusted content through `PromptDefanger`.
- Neutralize control tokens (`<|im_start|>`, `<<SYS>>`, `[INST]`, `<|endoftext|>`) with zero-width spaces (`\u200b`) and wrap content in `<untrusted_source>` SHA-256 boundaries.

---

## Policies and contribution guidelines

- Contributing guide: [contribute/CONTRIBUTING.md](contribute/CONTRIBUTING.md)
- Code of conduct: [contribute/CODE_OF_CONDUCT.md](contribute/CODE_OF_CONDUCT.md)
- Security policy: [contribute/SECURITY.md](contribute/SECURITY.md)
- License: [LICENSE](LICENSE)


