# Contributing to PigeonGraph

Thank you for your interest in contributing to **PigeonGraph**!

PigeonGraph is an open-source, multi-layer code knowledge graph designed to give AI coding agents (Claude, Antigravity, Cursor, Gemini) instant, zero-hallucination architectural navigation.

## Development Setup

### Prerequisites
- Node.js >= 22.5.0 (Node 24 recommended)
- npm >= 10.0.0

### Getting Started

1. **Clone the repository:**
   ```bash
   git clone https://github.com/Hoppy-Beast/pigeongraph.git
   cd pigeongraph
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Build all packages:**
   ```bash
   npm run build
   ```

4. **Run the test suite:**
   ```bash
   npm run test:all
   ```

## Repository Structure

```
pigeongraph/
├── packages/
│   ├── pigeongraph-schema/     # Formal Draft 2020-12 Schema, Invariant Hashes & Clocks
│   ├── pigeongraph-substrate/  # Fast Substrate Engine (AST, Synthesizers, SQLite WAL, WS Streamer)
│   ├── pigeongraph-semantic/   # Async Cognitive Worker (SQLite Queue, Defanger, ADR Synthesizer)
│   ├── pigeongraph-client/     # In-Memory Graph Store, Dual-Buffer Reconciler, 1-Shot Explore
│   └── pigeongraph-mcp/        # Stdio JSON-RPC MCP Server & CLI binary
```

## Pull Request Guidelines

1. **No Code Without Tests:** Ensure every bug fix or feature addition includes unit tests in the appropriate package's `test/` directory.
2. **Deterministic Foundations:** Never introduce probabilistic or LLM guessing into the Layer 1 AST extraction engine. Layer 1 must remain 100% deterministic with 0 token cost.
3. **Format & Typecheck:** Run `npm run build && npm run test:all` before submitting your PR.

## License & Attribution

By contributing to PigeonGraph, you agree that your contributions will be licensed under the project's [MIT License](LICENSE).
Original Author & Creator: **MD. Mahinur Rahman Prachurza (Hoppy-Beast)**.
