---
description: PigeonGraph architectural exploration and symbol discovery rules
globs: *
alwaysApply: true
---

# 🐦 PigeonGraph Exploration Protocol (Antigravity)

When exploring or modifying this codebase, **ALWAYS call PigeonGraph first** (`pigeongraph_explore` MCP tool or `pigeongraph explore "<query>"` CLI) before using `grep`, `grep_search`, `find`, or reading multiple whole files.
- Use `pigeongraph_explore` for symbol definitions, routes, middleware, classes, functions, and call chains.
- Use `pigeongraph_impact` to assess blast radius before refactoring.
- Efficiency flags: `limit`/`offset`, `token_budget` + `include_spans`, `include_semantic`/`include_flows`/`include_dispatches` toggles, and `compact:true` for symbols + query_summary only.
- Recent anchors auto-record to the working-set; inspect via `pigeongraph_context` (`get`/`clear`).
- Use `grep` ONLY for raw non-code string literals, comments, or regex across text files. If PigeonGraph returns 0 results: run `pigeongraph index` in the repo root, retry once, and only then fall back to grep.
