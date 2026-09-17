# CLAUDE.md: Instructions for Claude Code & Desktop

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
<!-- /pigeongraph-guidance -->
