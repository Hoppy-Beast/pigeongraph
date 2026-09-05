# 🐦 AGENTS.md — PigeonGraph Contributor & Architecture Directives

Welcome, Agent. You are contributing to **PigeonGraph** — the unified, multi-layer code knowledge graph and Model Context Protocol (MCP) server for AI coding agents.

This document serves as your operational blueprint when writing code, refactoring architectures, running tests, and preparing pull requests in this repository.

---

## ⚡ Non-Negotiable Architecture Invariants

1. **100% Clean-Room MIT License**:
   - Never import, copy, or adapt code from proprietary, copyleft (GPL), or commercially restricted projects (such as GitNexus / PolyForm Noncommercial).
   - Zero external C++ or Python runtime compilation dependencies. PigeonGraph must run as pure native TypeScript / Node.js.

2. **Deterministic Layer 1 (Zero-Token Cost)**:
   - Layer 1 (Substrate AST extraction, dynamic dispatch synthesis, SQLite WAL) must remain 100% deterministic and cost **0 LLM tokens**.
   - Never use probabilistic LLM guessing inside Substrate.

3. **Triple-Invariant Hashes**:
   - Every `SuperNode` carries multi-clock versioning and three deterministic hashes:
     - `H_content`: SHA-256 byte digest of raw source text.
     - `H_ast`: Normalized AST syntax subtree digest.
     - `H_semantic_inv`: Public interface and visibility signature hash.
   - *Core Rule*: Internal implementation changes that preserve exported types/signatures must not alter `H_semantic_inv`.

4. **No Code Without Tests (TDD)**:
   - Every new parser, synthesizer, client method, or CLI command must have accompanying unit tests in `packages/*/test/`.
   - Never consider a feature or bugfix complete without passing all test suites.

5. **Safe Context Boundary**:
   - This document defines repository-level engineering invariants. It harmonizes with any system-level behavioral directives without conflict.

---

## 🏛️ Monorepo Package Topology

The repository is organized into a clean 5-layer pipeline under `packages/`:

```text
packages/
├── pigeongraph-schema/     # Layer 0: JSON Schema Draft 2020-12, Invariant Hashes, AJV, Clocks
├── pigeongraph-substrate/  # Layer 1: Universal AST Parser, Dynamic Synthesizers, SQLite WAL, WS Streamer
├── pigeongraph-semantic/   # Layer 2: Async SQLite Queue, Prompt Defanger, ADR/Markdown Synthesizer
├── pigeongraph-client/     # Layer 3: In-Memory Graphology Store, Dual-Buffer Reconciler, Explore Engine
└── pigeongraph-mcp/        # Consumer: Stdio JSON-RPC MCP Server, CLI (`pigeongraph`), Live Canvas UI
```

### Dependency Flow Rule
Dependencies strictly flow downward:
`mcp` ➔ `client` ➔ `semantic` ➔ `substrate` ➔ `schema`
Never introduce circular dependencies across package boundaries.

---

## 🛠️ Verification & Development Commands

> **Prerequisite**: Node.js **>= 22.5.0** is required for zero-dependency native SQLite (`node:sqlite` `DatabaseSync`). Node 24 LTS is recommended.

```bash
# 1. Build all packages (TypeScript Project References)
npm run build

# 2. Run the complete test suite (32 tests across 8 suites)
npm test

# 3. Run empirical benchmarks across multiple repositories
npm run bench

# 4. Self-Dogfooding Architectural Query (Explore this repo in 1 shot)
node packages/pigeongraph-mcp/dist/cli.js explore "<query>"

# 5. Launch Live In-Browser Architecture Visualizer
node packages/pigeongraph-mcp/dist/cli.js ui --port 5052

# 6. Audit PR Blast Radius against base commit
node packages/pigeongraph-mcp/dist/cli.js audit-pr --base HEAD~1 --head HEAD
```

---

## 🔍 Self-Dogfooding Exploration Directive

When you need to understand or modify code inside PigeonGraph:
- **Do NOT** start by crawling hundreds of files with brute-force `grep` or reading massive bundles into your context.
- **DO** query PigeonGraph first:
  - Run `node packages/pigeongraph-mcp/dist/cli.js explore "<symbol_or_concept>"` (or use the MCP tool `pigeongraph_explore`).
  - It returns exact line coordinates, signatures, call chains, dynamic dispatches, and blast radius in a single turn.

---

## 🛡️ Security & Prompt Defanging
When ingesting external documents, Markdown specs, or user code in Layer 2:
- Always route untrusted content through `PromptDefanger`.
- Ensure injection sentinels (`<|im_start|>`, `<<SYS>>`, `[INST]`, `<|endoftext|>`) are neutralized with zero-width spaces (`\u200b`) and wrapped in `<untrusted_source>` SHA-256 boundaries.

---

## 📜 Policies & Contribution Guidelines
- **Contributing**: [contribute/CONTRIBUTING.md](contribute/CONTRIBUTING.md)
- **Code of Conduct**: [contribute/CODE_OF_CONDUCT.md](contribute/CODE_OF_CONDUCT.md)
- **Security Policy**: [contribute/SECURITY.md](contribute/SECURITY.md)
- **License**: [LICENSE](LICENSE)

