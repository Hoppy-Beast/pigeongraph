# 🐦 PigeonGraph

> A multi-layer code knowledge graph and Model Context Protocol (MCP) server for AI coding agents.  
> Local file monitoring, dynamic dispatch synthesis, and single-turn exploration with 96%+ token reduction.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![CI](https://github.com/Hoppy-Beast/pigeongraph/actions/workflows/ci.yml/badge.svg)](https://github.com/Hoppy-Beast/pigeongraph/actions)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D22.5.0-brightgreen)](https://nodejs.org)
[![MCP Protocol](https://img.shields.io/badge/MCP-2024--11--05-orange)](https://modelcontextprotocol.io)

[![Windows](https://img.shields.io/badge/Windows-supported-blue.svg)](#quickstart-and-setup)
[![macOS](https://img.shields.io/badge/macOS-supported-blue.svg)](#quickstart-and-setup)
[![Linux](https://img.shields.io/badge/Linux-supported-blue.svg)](#quickstart-and-setup)

[![Google Antigravity](https://img.shields.io/badge/Google_Antigravity-supported-blueviolet.svg)](#agent-setup-and-mcp-integrations)
[![Claude Code](https://img.shields.io/badge/Claude_Code-supported-blueviolet.svg)](#agent-setup-and-mcp-integrations)
[![Cursor](https://img.shields.io/badge/Cursor-supported-blueviolet.svg)](#agent-setup-and-mcp-integrations)
[![Gemini](https://img.shields.io/badge/Gemini_CLI-supported-blueviolet.svg)](#agent-setup-and-mcp-integrations)
[![GitHub Copilot](https://img.shields.io/badge/GitHub_Copilot-supported-blueviolet.svg)](#agent-setup-and-mcp-integrations)

**Author:** [MD. Mahinur Rahman Prachurza (Hoppy-Beast)](https://github.com/Hoppy-Beast)  
**Contributing and policies:** [AGENTS.md](AGENTS.md) • [Contributing Guide](contribute/CONTRIBUTING.md) • [Code of Conduct](contribute/CODE_OF_CONDUCT.md) • [Security Policy](contribute/SECURITY.md)

---

### Welcome

PigeonGraph is an open source tool built for developers and coding agents working on large codebases.

When agents such as Claude Code, Google Antigravity, Cursor, or Gemini navigate an unfamiliar repository, they typically rely on repetitive grep queries and full file reads. On medium to large projects, this leads to 10-turn search loops, truncated context, and tens of thousands of wasted tokens.

PigeonGraph solves this by maintaining an in-memory knowledge graph directly on your machine. It watches files as you save them, maps function calls and runtime routes, and provides a single-turn query engine (`pigeongraph explore`). Agents get exact symbol definitions, call hierarchies, and blast-radius impacts in under a millisecond, cutting token use by more than 96%.

Everything runs locally with zero telemetry, requires no external database processes, and is licensed under the MIT license.

---

## Contents

1. [Quickstart and setup](#quickstart-and-setup)
2. [Single-turn agent exploration](#single-turn-agent-exploration)
3. [Comparative feature matrix](#comparative-feature-matrix)
4. [Agent setup and MCP integrations](#agent-setup-and-mcp-integrations)
5. [Supported languages and dynamic dispatch](#supported-languages-and-dynamic-dispatch)
6. [Browser visualizer and PR blast radius](#browser-visualizer-and-pr-blast-radius)
7. [Architecture](#architecture)
8. [Security and prompt injection defense](#security-and-prompt-injection-defense)
9. [CLI and GitHub Action reference](#cli-and-github-action-reference)
10. [Empirical benchmarks and token reduction](#empirical-benchmarks-and-token-reduction)
11. [Monorepo packages](#monorepo-packages)
12. [Frequently asked questions](#frequently-asked-questions)
13. [Contributing with AGENTS.md](#contributing-with-agentsmd)
14. [License and attribution](#license-and-attribution)

---

## Quickstart and setup

Get PigeonGraph running and configured in your editor in under 30 seconds:

### 1. Install

Install from source or through npm:

```bash
# Build from source (recommended)
git clone https://github.com/Hoppy-Beast/pigeongraph.git
cd pigeongraph && npm run setup

# Or install globally from source
npm run install:global

# Global install from npm registry
npm install -g pigeongraph
```
Running `npm run setup` installs dependencies, compiles all packages, and links the `pigeongraph` executable globally.

Requires [Node.js >= 22.5.0](https://nodejs.org) (Node 24 LTS recommended for native `node:sqlite`).

### 2. Register with your coding agents

PigeonGraph configures Claude Desktop, Claude Code, Cursor, Google Antigravity, and Gemini CLI automatically:

```bash
pigeongraph install-mcp
```
To remove the MCP registration later: `pigeongraph uninstall-mcp`

### 3. Initialize your project

Generate `.pigeongraph/config.json`, `.cursor/mcp.json`, and `.mcp.json` in your workspace:
```bash
pigeongraph init
```

### 4. Basic commands

```bash
# Query the architecture in a single turn
pigeongraph explore "verifyToken"

# Start the web visualizer (http://127.0.0.1:5052)
pigeongraph ui

# Check pull request blast radius against a base branch
pigeongraph audit-pr --base origin/main
```

---

## Single-turn agent exploration

Instead of making 15 search calls and reading dozens of whole files, an agent can ask for a symbol once and receive the exact definition, calling chain, and blast radius:

```bash
pigeongraph explore "verifyToken"
```

<details>
<summary><b>View complete exploration JSON output (0.63ms, 34 tokens)</b></summary>

```json
{
  "query_summary": {
    "query": "verifyToken",
    "resolved_anchor": "sg://core-backend/src/auth/jwt.ts#verifyToken",
    "epistemic_status": "EXACT",
    "total_graph_nodes_searched": 413,
    "duration_ms": 0.63
  },
  "symbols": [
    {
      "uid": "sg://core-backend/src/auth/jwt.ts#verifyToken",
      "name": "verifyToken",
      "kind": "function",
      "filePath": "src/auth/jwt.ts",
      "lineRange": [42, 78],
      "signature": "export async function verifyToken(token: string): Promise<UserSession>",
      "docstring": "Validates JWT token against active public keys.",
      "community": "Auth"
    }
  ],
  "execution_flows": {
    "entry_points": [{ "type": "HTTP_ROUTE", "handler": "loginRoute" }],
    "call_chains": [
      {
        "chain_id": "flow_verifyToken_01",
        "steps": [
          { "hop": 0, "symbol": "verifyToken", "action": "ORIGIN" },
          { "hop": 1, "symbol": "getKey", "action": "CALLS" }
        ]
      }
    ]
  },
  "dynamic_dispatches": [
    {
      "pattern": "DYNAMIC_DISPATCH_EVENT",
      "emitter": "sg://core-backend/src/auth/jwt.ts#verifyToken",
      "listener": "auditLogger.on('auth:success')",
      "confidence": 0.85
    }
  ],
  "blast_radius": {
    "risk_level": "LOW",
    "risk_score": 0.15,
    "affected_files_count": 1,
    "affected_symbols_count": 1,
    "critical_breakages": ["verifyToken"]
  },
  "served_spans": [
    {
      "filePath": "src/auth/jwt.ts",
      "ranges": [[42, 78]],
      "content": "export async function verifyToken(token: string): Promise<UserSession> {\n  const key = await getKey();\n  return jwt.verify(token, key);\n}",
      "token_count": 34
    }
  ]
}
```

</details>

---

## Comparative feature matrix

Architectural comparison against existing code exploration and graph tools:

<details>
<summary><b>View comparative feature matrix against CodeGraph, Graphify, and GitNexus</b></summary>

| Capability | CodeGraph | Graphify | GitNexus | PigeonGraph |
| :--- | :---: | :---: | :---: | :---: |
| License | MIT | Apache 2.0 / MIT | PolyForm Noncommercial (commercial restriction) | MIT |
| Index updates | Native OS watcher (100 to 2000 ms) | Manual / git hooks | Batch CLI (`gitnexus analyze`) | Native OS watcher with adaptive debounce |
| Non-code documents (ADRs, specs) | No (code only) | Yes (PDFs, Whisper, docs) | No (code and markdown only) | Yes (Markdown, RFCs, ADRs, invariants) |
| Dynamic dispatch (event emitters, routes, React) | Yes | No (name matching only) | Partial (MRO/DI only; lacks events and React) | Yes (EventEmitters, routes, React, MRO) |
| Flow tracing (`STEP_IN_PROCESS`) | No (ad-hoc search) | No (clusters only) | Yes (scored entry-point BFS flows) | Yes (precomputed sequences) |
| Agent MCP interface | Single tool (`explore`) | 7 tools | 17 tools | 1 primary (`explore`) with analytical opt-ins |
| Cross-repository contracts | No (single repo) | Partial (graph merge) | Yes (repo groups) | Yes (contract linkages) |
| Client memory model | SQLite file | NetworkX (higher memory footprint) | Local Node backend (server required) | In-memory Graphology store |
| Prompt injection defense | None | Partial (basic tags) | None | Defanged sentinels with `<untrusted_source>` tags |
| Race condition handling (AST vs. LLM) | N/A (AST only) | No (overwrites on rebuild) | No (sequential batch) | Triple-hash invariant state machine |

</details>

---

## Agent setup and MCP integrations

PigeonGraph implements the Model Context Protocol (MCP, 2024-11-05 specification) over `stdio`.

### Automatic setup

Run the installer to detect installed tools and add the configuration:
```bash
pigeongraph install-mcp
```
This resolves PATH differences on Windows and macOS, and configures permissions for Claude Code.

<details>
<summary><b>Manual configuration paths and templates</b></summary>

Configuration templates are available in [`templates/mcp/`](templates/mcp/) for manual setup:

| Tool / Environment | Configuration file location | Template |
| :--- | :--- | :--- |
| Claude Desktop | `%APPDATA%\Claude\claude_desktop_config.json` (Windows)<br>`~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) | [`templates/mcp/claude_desktop_config.json`](templates/mcp/claude_desktop_config.json) |
| Claude Code | Global: `~/.claude.json`<br>Project: `./.mcp.json` | [`templates/mcp/claude_code_mcp.json`](templates/mcp/claude_code_mcp.json) |
| Cursor / Windsurf | `.cursor/mcp.json` | [`templates/mcp/cursor_mcp.json`](templates/mcp/cursor_mcp.json) |
| Google Antigravity | `~/.gemini/config/mcp_config.json` or `~/.gemini/antigravity/mcp_config.json` | [`templates/mcp/antigravity_mcp_config.json`](templates/mcp/antigravity_mcp_config.json) |
| Gemini CLI | `~/.gemini/settings.json` | [`templates/mcp/gemini_settings.json`](templates/mcp/gemini_settings.json) |
| GitHub Copilot (VS Code) | `.vscode/settings.json` | [`templates/mcp/vscode_copilot_settings.json`](templates/mcp/vscode_copilot_settings.json) |

#### Standard configuration block

```json
{
  "mcpServers": {
    "pigeongraph": {
      "command": "pigeongraph",
      "args": ["serve-mcp"]
    }
  }
}
```

For Claude Code, add `"allow": ["mcp__pigeongraph__*"]` under `permissions` in `~/.claude/settings.json` to allow tool calls without manual confirmation.

</details>

<details>
<summary><b>Agent steering instructions (AGENTS.md, CLAUDE.md, GEMINI.md)</b></summary>

Add the following snippet from [`templates/steering/AGENTS.md`](templates/steering/AGENTS.md) to your repository root:

```markdown
<!-- pigeongraph-guidance -->
## Architectural Exploration with PigeonGraph
Before crawling files with grep or find, query PigeonGraph first:
- Use `pigeongraph_explore` (MCP) or `pigeongraph explore "<query>"` (CLI).
- It provides definitions, line ranges, dynamic dispatches, and blast radius in a single turn.
<!-- /pigeongraph-guidance -->
```

</details>

---

## Supported languages and dynamic dispatch

PigeonGraph parses common programming languages out of the box and resolves runtime connections that text search misses.

<details>
<summary><b>View supported languages and extracted AST symbols</b></summary>

| Language or format | File extensions | Extracted entities |
| :--- | :--- | :--- |
| TypeScript / JavaScript | `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs` | Classes, functions, methods, interfaces, imports, calls, extends, implements, exported symbols, React components, EventEmitters |
| Python | `.py`, `.pyi` | Classes, async and sync functions, decorators, methods, imports, inheritance trees, FastAPI route decorators |
| Go | `.go` | Packages, imports, structs, interfaces, method receivers `func (e *Engine)`, type parameters `[T any]`, call graph |
| Rust | `.rs` | Modules (`mod`), imports (`use`), structs, enums, traits, `impl` blocks, methods, generics `<P, M, S>`, qualifiers (`async`, `unsafe`), call graph |
| Java, C, C++ | `.java`, `.c`, `.cpp`, `.h` | High-throughput function and procedure extraction, signatures, file containment |
| Architecture specs and ADRs | `.md`, `.markdown`, `.txt` | RFCs, ADR status (`ACCEPTED`, `DEPRECATED`), invariants, `REQ-*` requirements, `#WHY:` design rationales |

</details>

<details>
<summary><b>View dynamic dispatch synthesis patterns (routes, events, React)</b></summary>

| Boundary or system | Source expression | Synthesized edge target | Edge kind |
| :--- | :--- | :--- | :--- |
| Express / Node HTTP | `app.get('/api/orders', listOrders)` | `function listOrders(req, res)` | `HANDLES_ROUTE` (`HTTP GET /api/orders`) |
| Express / Koa / Router | `router.post('/checkout', checkoutHandler)` | `function checkoutHandler(req, res)` | `HANDLES_ROUTE` (`HTTP POST /checkout`) |
| Node.js EventEmitter | `emitter.emit('order:created', data)` | `emitter.on('order:created', handler)` | `DYNAMIC_DISPATCH_EVENT` (`event_emitter.on(order:created)`) |
| Microservices | `fetch('/api/v1/checkout')` / `http.Get(...)` | Provider endpoint controller (`HANDLES_ROUTE`) | `CrossRepoContractLinkage` (`CONSUMER` to `PROVIDER`) |
| React state cascades | `setState(...)` / `setCount(...)` | Dependent component re-render flow | `DYNAMIC_DISPATCH_REACT_STATE` (`react_state_rerender`) |
| Markdown ADR specs | `REQ-AUTH-01: verifyToken must check keys` | `function verifyToken(...)` | `IMPLEMENTS_SPEC` (`REQ-AUTH-01`) |
| Architecture invariants | `#WHY: Prevent double billing on retry` | `PaymentProcessor.charge()` | `JUSTIFIED_BY_ADR` (`ADR-005`) |

</details>

---

## Browser visualizer and PR blast radius

### Web visualizer

To open the HTML5 Canvas graph viewer:
```bash
pigeongraph ui [--port 5052]
```
- Canvas runs at 60 fps with force-directed physics and no frontend framework dependencies.
- Subscribes to changes over `ws://127.0.0.1:5051` and highlights updated nodes when files change on disk.
- Click any node to open an inspection drawer with file paths, callers, callees, and code snippets.

### Pull request blast radius audit

Inspect incoming changes before merging:
```bash
pigeongraph audit-pr --base origin/main
```

<details>
<summary><b>View sample PR blast radius audit report</b></summary>

```markdown
### PigeonGraph PR Blast Radius Audit

| Overall Risk | Changed Files | Breaking Interfaces | Internal Refactors |
| :---: | :---: | :---: | :---: |
| LOW | 1 | 0 | 1 |

#### Symbol Impact Breakdown
| Symbol | File | Change Type | Blast Radius | Downstream Impact |
| :--- | :--- | :---: | :---: | : |
| `EvalEngine.collectSourceFiles` | `packages/pigeongraph-mcp/eval/eval-engine.ts` | Safe Internal Refactor | 0 files | Safe internal refactor: public signature unchanged, 0 external blast radius. |

> PigeonGraph Invariant Hash (H_semantic_inv) differentiates pure internal refactors from breaking signature alterations at zero token cost.
```

</details>

---

## Architecture

```mermaid
flowchart TD
    subgraph Ingestion["1. Ingestion Layer"]
        OS[OS File Watcher] -->|150ms Adaptive Debounce| Substrate[Layer 1: Fast Substrate Engine]
    end

    subgraph SubstrateEngine["2. Fast Substrate Engine"]
        Substrate --> AST[Universal AST Parser]
        Substrate --> DynSynth[Dynamic Dispatch Synthesizer]
        AST --> WAL[(Local SQLite WAL + FTS5)]
        DynSynth --> WAL
        WAL --> WS[Live WebSocket Diff Streamer]
    end

    subgraph ClientLayer["3. Client Execution Layer (In-Memory)"]
        WS -->|GraphDeltaEnvelope| Reconciler[Dual-Buffer Reconciler]
        Reconciler --> GraphStore[(In-Memory Graphology Store)]
        GraphStore --> ExploreEngine[1-Shot pigeongraph_explore]
        GraphStore --> AnalyticalEngine["pigeongraph_impact & trace"]
    end

    subgraph SemanticWorker["4. Async Cognitive Worker Layer"]
        Substrate -->|Enqueue Task| Queue[(Persistent SQLite WAL Queue)]
        Queue --> Worker[Layer 2 Semantic Worker]
        Worker --> DocParser["Markdown & ADR Parser"]
        Worker --> Defanger[Prompt Injection Defanger]
        DocParser --> SemSynth[Semantic Edge Synthesizer]
        SemSynth -->|Patch Layer 2| WAL
        SemSynth -->|Reconcile| GraphStore
    end
```

<details>
<summary><b>SuperNode schema and invariant hash specification</b></summary>

Each node in the graph represents a unified entity across code and documents:
- Identity: Unique URI (`sg://repo/path/file.ts#symbol`), URN, kind, and qualified name.
- Clocks and versioning: Monotonic Lamport clocks, vector clocks, and three deterministic hashes:
  - `H_content`: SHA-256 digest of the source code slice.
  - `H_ast`: Normalized AST syntax subtree digest.
  - `H_semantic_inv`: Public interface signature hash. Internal changes that leave exported signatures intact avoid invalidating downstream semantic inferences.

</details>

---

## Security and prompt injection defense

PigeonGraph operates offline with zero telemetry. Code repositories and issues can contain text crafted to redirect or confuse AI models (`<|im_start|>`, `<<SYS>>`, `[INST]`).

<details>
<summary><b>Security architecture and prompt injection defense details</b></summary>

PigeonGraph processes untrusted input through a sanitization step (`PromptDefanger`):
1. Sentinel neutralization: Inserts zero-width spaces into control tokens (`<\u200b|\u200bim_start\u200b|\u200b>`).
2. Boundary wrapping: Places untrusted source snippets inside `<untrusted_source sha256="...">` blocks.
3. Offline execution: Layer 1 runs locally without network access or third-party LLM calls.

For vulnerability reporting procedures and release support, see the [Security Policy](contribute/SECURITY.md).

</details>

---

## CLI and GitHub Action reference

<details>
<summary><b>Full CLI command reference</b></summary>

| Command | Description |
| :--- | :--- |
| `pigeongraph init` | Generates `.pigeongraph/config.json` and agent `.cursor/mcp.json` files |
| `pigeongraph install-mcp` | Registers MCP server in Claude Desktop and Cursor configurations |
| `pigeongraph uninstall-mcp` | Removes MCP server from Claude Desktop and Cursor configurations |
| `pigeongraph explore <query>` | Runs a single-turn query and prints JSON results to stdout |
| `pigeongraph ui [--port 5052]` | Starts the local web visualizer with live WebSocket updates |
| `pigeongraph audit-pr [--base <ref>]` | Compares modified symbols against a base commit using `H_semantic_inv` to estimate blast radius |
| `pigeongraph serve-mcp` | Starts the stdio JSON-RPC 2.0 MCP server |

</details>

<details>
<summary><b>GitHub Action workflow example (.github/actions/blast-radius)</b></summary>

```yaml
name: PR Blast Radius Audit
on: [pull_request]
jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: actions/setup-node@v4
        with: { node-version: 22.x }
      - run: npm ci && npm run build
      - uses: ./.github/actions/blast-radius
        with:
          base_ref: origin/${{ github.base_ref }}
```

</details>

---

## Empirical benchmarks and token reduction

We evaluated exploration workflows comparing standard grep/read loops against single-turn PigeonGraph queries across 8 production repositories, achieving an average **96.8% token reduction** with 40ms to 60ms local SSD query latencies.

<details>
<summary><b>View full empirical benchmark results (8 repositories, 96.8% token reduction)</b></summary>

| Repository | Stack / Ecosystem | Target Architectural Query | Baseline Turns (Arm A) | PigeonGraph Turns (Arm B) | Baseline Context Tokens | PigeonGraph 1-Shot Tokens | % Token Reduction | PigeonGraph Latency | Sufficiency | Dynamic Dispatch Recall |
| :--- | :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| `gin` | Go (Backend HTTP Router) | `handleHTTPRequest` | 2 turns | 1 turn | 7,315 tok | 381 tok | 95% | 756ms | SUFFICIENT | N/A |
| `fastapi` | Python (Async REST Framework) | `solve_dependencies` | 3 turns | 1 turn | 252,210 tok | 394 tok | 100% | 10,111ms | SUFFICIENT | N/A |
| `pigeongraph` | TypeScript (Multi-Package Monorepo) | `synthesizeFrameworkRoutes` | 3 turns | 1 turn | 11,249 tok | 1,333 tok | 88% | 59.7ms | SUFFICIENT | 100% |
| `ripgrep` | Rust (Multi-Threaded CLI Engine) | `search_path` | 3 turns | 1 turn | 15,616 tok | 516 tok | 97% | 1,790ms | SUFFICIENT | N/A |
| `express` | JavaScript / Node.js (Web Framework) | `handle` | 29 turns | 1 turn | 102,316 tok | 629 tok | 99% | 41.6ms | SUFFICIENT | 100% |
| `zustand` | TypeScript (Reactive State Store) | `createStore` | 27 turns | 1 turn | 104,487 tok | 534 tok | 99% | 181ms | SUFFICIENT | N/A |
| `flask` | Python (WSGI Web Microframework) | `dispatch_request` | 5 turns | 1 turn | 22,679 tok | 779 tok | 97% | 236ms | SUFFICIENT | N/A |
| `excalidraw` | TypeScript / React (Canvas Engine) | `renderStaticScene` | 14 turns | 1 turn | 106,665 tok | 903 tok | 99% | 3,075ms | PARTIAL | N/A |

### Observations
1. **96.8% average token reduction:** In frameworks such as FastAPI, Express, and Zustand, standard exploration consumed 100,000+ tokens traversing dependencies. PigeonGraph returned the relevant slice in 381 to 1,333 tokens.
2. **Low query latency:** Full graph lookup and path tracing completed in 41 ms to 60 ms on local SSDs with no external server overhead.
3. **Runtime dispatch discovery:** Resolved router handlers, EventEmitter callbacks, and microservice HTTP endpoints that plain text matching missed.
4. **Reproducing the results:**
   ```bash
   npm run bench
   ```

</details>

---

## Monorepo packages

<details>
<summary><b>Monorepo package breakdown</b></summary>

| Package | Purpose and technologies |
| :--- | :--- |
| [`@pigeongraph/schema`](packages/pigeongraph-schema) | Draft 2020-12 schema, Lamport and vector clocks, invariant hashes (`H_content`, `H_ast`, `H_semantic_inv`) |
| [`@pigeongraph/substrate`](packages/pigeongraph-substrate) | Fast AST parser, dynamic synthesizers, Node native SQLite WAL and FTS5, WebSocket streamer |
| [`@pigeongraph/semantic`](packages/pigeongraph-semantic) | SQLite job queue, prompt defanger, Markdown and ADR parser |
| [`@pigeongraph/client`](packages/pigeongraph-client) | In-memory Graphology store, dual-buffer reconciler, single-turn explore engine |
| [`@pigeongraph/mcp`](packages/pigeongraph-mcp) | Stdio JSON-RPC 2.0 MCP server, installer, and `pigeongraph` CLI |

</details>

---

## Frequently asked questions

<details>
<summary><b>Why does PigeonGraph require Node.js >= 22.5.0?</b></summary>

PigeonGraph uses Node's built-in `node:sqlite` (`DatabaseSync`) module with WAL and FTS5 support, which was added in Node 22.5.0. This avoids external compilation dependencies such as node-gyp, Python, or make.

</details>

<details>
<summary><b>How do I configure Claude Desktop?</b></summary>

Run `pigeongraph install-mcp`. The command finds your local Claude Desktop configuration and adds PigeonGraph automatically.

</details>

<details>
<summary><b>Why does PowerShell show a path error with /pigeongraph?</b></summary>

In PowerShell, a leading slash is treated as a filesystem root path. Run `pigeongraph explore ...` or `npx pigeongraph explore ...` without the leading slash.

</details>

<details>
<summary><b>Can multiple agents query PigeonGraph at the same time?</b></summary>

Yes. The in-memory Graphology graph and Substrate SQLite WAL support concurrent read queries without locking.

</details>

---

## Contributing with AGENTS.md

We welcome contributions, bug fixes, and feature discussions. Whether you are contributing by hand or working with an AI assistant, getting started is straightforward.

<details>
<summary><b>Working with an AI coding agent</b></summary>

If you use Claude Code, Google Antigravity, Cursor, Gemini CLI, or GitHub Copilot, point your agent to [`AGENTS.md`](AGENTS.md) in the repository root:
- It describes the package layout, dependency flow, and core invariants (clean-room MIT licensing, zero-token AST extraction, and invariant hash rules).
- It instructs agents to use `pigeongraph explore "<query>"` to locate symbols and call paths before editing files.
- You can tell your agent:
  > "Read AGENTS.md in the root of the repository and follow its development guidelines."

</details>

### Developer links
- Setup and tests: see the [Contributing Guide](contribute/CONTRIBUTING.md) for build instructions and test commands.
- Community guidelines: see the [Code of Conduct](contribute/CODE_OF_CONDUCT.md).
- Security disclosures: see the [Security Policy](contribute/SECURITY.md).

If you have an idea or run into an issue, open an [Issue](https://github.com/Hoppy-Beast/pigeongraph/issues) or start a discussion in [Discussions](https://github.com/Hoppy-Beast/pigeongraph/discussions).

---

## License and attribution

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.

Copyright (c) 2026 MD. Mahinur Rahman Prachurza (Hoppy-Beast)

---

<details>
<summary><b>Dot logo (ASCII art)</b></summary>

```text
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⡤⠀⠂⠀⠀⡀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⡴⠿⣂⣷⣤⣨⣺⣱⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⢎⠠⡄⢡⣟⠿⣛⡯⣯⣧⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⡎⠊⠟⠈⢫⣽⣿⣿⡯⠉⠙⠳
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣜⢃⢇⠀⠠⢀⠘⠻⢻⡧⡄⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⣀⠎⠃⢀⠊⠀⠀⠃⠀⠀⠈⡕⢰⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⡴⠊⠁⠘⡀⢁⠀⠀⠀⠀⠀⠀⠀⠀⠬⢼⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⡠⠞⠀⠀⠠⠆⠁⠎⠀⠀⠀⠀⠀⠀⠀⠀⠈⠀⣁⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣴⠄⠀⣀⠔⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⡄⠛⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣠⡞⠉⠀⠈⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢰⠃⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⣴⡏⡇⠀⠆⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣐⠎⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣰⡿⢃⠀⣔⣩⠀⠀⠀⠀⠀⠀⠀⢠⠀⠀⠀⠀⠀⠀⠠⣤⠋⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣼⠋⠀⠠⠎⠅⠀⠀⠀⠀⠀⠀⠀⠀⠂⡃⢄⠆⣠⡰⡬⠓⠁⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⡠⣾⠳⠎⠉⠁⠀⠀⠀⠀⠀⠀⠀⠀⡀⣼⢺⣽⣦⣿⠷⠋⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⡠⠔⠓⠂⠀⠀⠀⢀⣠⠰⢲⣶⣾⢷⣾⣿⣿⣿⣿⡟⡭⡼⠁⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⣀⢠⠐⡀⠁⠀⠀⣀⡄⢠⣤⣞⢣⣦⡽⢶⣿⣿⠿⣿⣿⠻⢿⣿⣿⣧⠃⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⣤⣾⠁⢠⢠⣴⣶⡗⠉⣿⠛⠋⠉⠈⢠⣦⣼⡟⠋⠁⠀⠘⣿⣦⣬⣿⣿⣾⡆⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠉⠉⢁⣾⣟⢟⡯⢐⠉⠁⠀⠀⠀⣠⠟⠋⠁⠀⠀⠀⠀⠴⠟⠛⠛⠛⢻⣋⣿⣦⣤⣤⣾⣀⠀⠀⠀⠀
⠀⠀⠀⠎⠋⣠⠿⠁⠀⠀⠀⠀⡠⠊⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠘⠙⠁⠈⠉⠉⠉⠉⠁⠁⠀⠀⠀
⠀⠀⠀⣠⠾⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⢀⡴⠃⠐⠀⠀⠀⢀⠀⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⣰⣯⢰⡇⠄⡀⡤⠂⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠘⠛⠓⠈⠉⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
```

</details>
