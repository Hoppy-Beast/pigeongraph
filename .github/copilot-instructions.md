# GitHub Copilot Custom Instructions

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
