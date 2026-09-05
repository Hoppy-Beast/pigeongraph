# Contributing to PigeonGraph

PigeonGraph provides in-memory code knowledge graphs and Model Context Protocol tooling for AI coding assistants and developers.

## Development setup

### Prerequisites
- Node.js >= 22.5.0 (Node 24 LTS recommended)
- npm >= 10.0.0

### Getting started

1. Clone the repository:
   ```bash
   git clone https://github.com/Hoppy-Beast/pigeongraph.git
   cd pigeongraph
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Build packages and link globally:
   ```bash
   npm run setup
   ```

4. Run the test suite:
   ```bash
   npm run test:all
   ```

5. Run the multi-repository benchmark suite:
   ```bash
   npm run bench
   ```

## Repository structure

```text
pigeongraph/
├── packages/
│   ├── pigeongraph-schema/     # Draft 2020-12 schema, invariant hashes and clocks
│   ├── pigeongraph-substrate/  # AST parser, synthesizers, SQLite WAL, WebSocket streamer
│   ├── pigeongraph-semantic/   # Async SQLite queue, prompt defanger, ADR synthesizer
│   ├── pigeongraph-client/     # In-memory graph store, dual-buffer reconciler, explore engine
│   └── pigeongraph-mcp/        # Stdio JSON-RPC MCP server and CLI
```

## Pull request guidelines

1. Add unit tests: Include tests in the relevant package's `test/` directory for any bug fix or feature.
2. Maintain deterministic parsing: Layer 1 AST extraction must run offline with zero token cost.
3. Verify before submitting: Run `npm run build && npm test` to ensure tests and typechecks pass.

## AI coding agent directives

If you are using or developing with an AI coding assistant (Claude Code, Cursor, Google Antigravity, Gemini, or GitHub Copilot), see [**`AGENTS.md`**](../AGENTS.md) in the repository root for architecture rules, invariant hash contracts, and exploration workflows.

## Governance and security

- Code of Conduct: see [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
- Security vulnerabilities: see [SECURITY.md](SECURITY.md).

## License and attribution

Contributions are licensed under the project's [MIT License](../LICENSE).  
Original author: MD. Mahinur Rahman Prachurza (Hoppy-Beast).


