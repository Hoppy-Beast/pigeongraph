# PigeonGraph Master Social Launch Kit and Distribution Playbook

This master launch kit contains complete, humanized promotional copy and distribution guidelines for PigeonGraph across all relevant developer platforms.

Every draft here adheres strictly to the humanizer guidelines: no chatbot filler, no marketing buzzwords, zero em dashes, and an authentic developer voice based on the real story of building PigeonGraph.

---

## The core story behind the project

Use this core narrative across all discussions, comments, and interviews:

1. The problem: Coding agents like Claude Code and Cursor burn through context windows and tens of thousands of tokens by running 15 to 30 sequential grep commands and reading whole files just to navigate unfamiliar codebases.
2. The comparison: Three well-known code knowledge graph tools were tested. One required cloud infrastructure or external databases, one only supported static syntax trees without dynamic route links, and one dumped large chunks of code back into the prompt, repeating the same token burn.
3. The solution: PigeonGraph merges the best aspects of these approaches into a single local tool. It combines universal AST extraction, dynamic dispatch synthesis (like connecting Express, FastAPI, Gin, or Flask routes to controller handlers), and Node 24 native SQLite WAL in-process storage.
4. The result: Coding agents query architecture in a single MCP turn (`pigeongraph explore <symbol>`), cutting token use by 90% to 99% (e.g. Express dropped from 29 turns and 102k tokens to 1 turn and 629 tokens).
5. The ask: It is 100% free and open source under the MIT license. Developers are encouraged to use it, modify it, leave a star on GitHub, or contribute.

---

## 1. Reddit: General developer communities

**Target subreddits:**
- `r/LocalLLaMA` (Primary audience: developers running local models, agents, and MCP servers)
- `r/programming` (Focus on the AST and SQLite in-memory graph architecture)
- `r/node` (Focus on Node 24 native `node:sqlite` WAL performance)
- `r/selfhosted` (Focus on zero telemetry, offline-first design, and no cloud dependencies)

### Title options
- **Option A (Problem first):** I got tired of AI agents burning thousands of tokens searching code, so I built PigeonGraph (100% local, MIT)
- **Option B (Real story):** I tried 3 popular code graph repos, hit limits with each, and built PigeonGraph to fix agent token burn
- **Option C (Direct):** PigeonGraph: A local in-memory code knowledge graph and MCP server for coding agents

### Post body
I spend a lot of time working with AI coding agents like Claude Code and Cursor on medium to large codebases. My biggest frustration was watching them burn through context and tokens on basic exploration. An agent would run 15 to 30 grep searches in a row, pull entire files into context, and run out of room before writing any actual code.

I started looking around for code knowledge graph tools and found three well-known repositories. Each had good ideas, but also specific trade-offs that did not work for my daily workflow:
- One was heavily tied to cloud infrastructure and external databases, which introduced privacy concerns and setup overhead.
- Another only did static syntax analysis, so it missed runtime route handlers (like Express or FastAPI endpoints) and event listeners.
- The third dumped large text representations of code into the prompt, which brought back the exact same token burn problem.

None of them fit a lightweight, local agent workflow. So I decided to build PigeonGraph.

Here is what it does:
- Parses code across seven languages (TypeScript, JavaScript, Python, Rust, Go, Java, C/C++) directly on your machine.
- Links runtime routes and event dispatch so agents can see what actually handles a request.
- Stores the graph in Node 24 native SQLite with WAL mode. There are no external database servers or background daemons.
- Exposes an MCP server so tools like Claude Code, Cursor, Antigravity, and Gemini can get an answer in a single turn instead of twenty (`pigeongraph explore "symbol"`).

In testing on open source repos like Express and FastAPI, this cut token usage on search tasks by over 90%. For example, tracing a request handler in Express went from 29 search turns and 102k tokens down to one turn and 629 tokens.

The project is completely free and open source under the MIT license. You can use it, fork it, or modify it to build something better for your own setup.

If you find it useful, please consider leaving a star on GitHub or contributing. Opening an issue or submitting a PR is easy and very welcome.

GitHub repository:
https://github.com/Hoppy-Beast/pigeongraph

Google Colab demo (no local install needed):
https://colab.research.google.com/github/Hoppy-Beast/pigeongraph/blob/main/assets/pigeongraph_demo.ipynb

Quick install:
```bash
git clone https://github.com/Hoppy-Beast/pigeongraph.git
cd pigeongraph && npm run setup
pigeongraph install-mcp
```

Feedback, critique on the graph structure, and suggestions are welcome.

---

## 2. Reddit: r/ClaudeCode

**Subreddit rules addressed:**
- Rule 1: Strictly about Claude Code.
- Rule 2: Uses the `Built with Claude Code` or `Projects & Showcases` flair.
- Rule 3: Includes concrete benchmarks, reproduction steps, and tool comparison.
- Rule 4 & 5: Standalone post that explains what was built, how Claude Code was used, and what was learned. Free and MIT.

**Post title:**  
`I used Claude Code to build PigeonGraph: an in-memory code graph MCP server that cuts agent exploration turns from 20+ to 1 (MIT)`

### Post body
### The problem I kept hitting in Claude Code

When I run Claude Code on unfamiliar medium or large codebases, the biggest token sink is the initial discovery phase. Claude Code typically runs sequential bash grep commands and file reads to figure out how a project is organized.

On a large repo, this pattern often takes 15 to 30 tool turns. Context fills up with raw file contents before Claude Code even begins writing or refactoring code.

I looked at three existing code knowledge graph tools. Each had good ideas, but none fit my daily workflow:
- One required cloud infrastructure and external databases.
- Another only parsed static syntax trees, completely missing runtime links like Express or FastAPI routes.
- The third dumped massive text representations of the graph back into the prompt, creating the exact same token problem.

So I used Claude Code to help me build PigeonGraph: a local in-memory code knowledge graph that acts as an MCP server.

---

### What PigeonGraph does

Instead of Claude Code running 20 bash commands, it calls one MCP tool: `pigeongraph_explore`.

In a single turn, the tool returns:
- The exact symbol definition and line coordinates across seven languages (TypeScript, JavaScript, Python, Rust, Go, Java, C/C++).
- Dynamic dispatch links that static ASTs miss (such as connecting an HTTP route handler directly to its controller).
- Inbound and outbound call hierarchies.
- Blast radius calculations.

The entire engine runs locally in Node 24 using native SQLite (`node:sqlite`) in WAL mode. There are no background servers, no Docker containers, and no telemetry.

---

### How Claude Code helped build it

I dogfooded Claude Code throughout the development process:
1. Parser test suites: I used Claude Code to generate edge-case test suites for universal AST extraction across multiple languages.
2. Route synthesis heuristics: Claude Code helped trace how popular web frameworks (Express, FastAPI, Gin, Flask) register routes dynamically, allowing us to write regex and AST matchers that link routes to handlers across files.
3. MCP integration testing: I hooked Claude Code directly to local builds via `claude mcp add` to monitor tool latency and token consumption on real open source repositories.

---

### What I learned

1. Dynamic routing is the biggest blindspot for coding agents. Static AST tools know where a function is declared, but they fail to link `app.get('/api/users', getUser)` across modules. Coding agents get stuck in grep loops trying to bridge that gap.
2. Tool response density matters more than tool count. Truncating file reads helps, but giving the agent an exact graph slice with call chains preserves Claude Code's reasoning context for the actual coding task.
3. Native SQLite WAL in Node 24 is fast enough for sub-millisecond local graph traversals without needing a separate daemon running on the user's machine.

---

### Test results on open source repos

Comparing Claude Code using raw grep against Claude Code using PigeonGraph's MCP tool:

- **Express (`handle` route discovery):**
  - Baseline: 29 search turns, 102,316 tokens
  - With PigeonGraph: 1 turn, 629 tokens (41ms)
- **FastAPI (`solve_dependencies`):**
  - Baseline: 3 turns, 252,210 tokens
  - With PigeonGraph: 1 turn, 394 tokens
- **Ripgrep (`search_path`):**
  - Baseline: 3 turns, 15,616 tokens
  - With PigeonGraph: 1 turn, 516 tokens

---

### How to test it

The tool is 100% free and open source under the MIT license.

To add it to Claude Code locally:
```bash
git clone https://github.com/Hoppy-Beast/pigeongraph.git
cd pigeongraph && npm run setup
pigeongraph install-mcp
```
Or register manually:
```bash
claude mcp add pigeongraph -- npx -y pigeongraph serve-mcp
```

You can also test the exploration queries in a browser without installing anything:  
Google Colab Demo: https://colab.research.google.com/github/Hoppy-Beast/pigeongraph/blob/main/assets/pigeongraph_demo.ipynb

GitHub repository:  
https://github.com/Hoppy-Beast/pigeongraph

Feel free to use it, modify it for your own setup, or contribute. If you find it useful, leaving a star on GitHub is appreciated.

---

## 3. Reddit: r/ClaudeAI

**Subreddit rules addressed:**
- Rule 7: Project built with Claude / specifically for Claude by you. Clear description of what was built, how Claude helped in detail, free to try, minimal promotional language, no referral links, OP karma > 100.
- Rule 9: Uses the `Project / Showcase` flair.

**Post title:**  
`I built PigeonGraph to stop Claude from burning context on 20+ grep searches in large codebases (Free, MIT, Built with Claude)`

### Post body
### Background and problem

When using Claude and Claude Code on medium-to-large software repositories, one recurring issue is context consumption during initial repository navigation. When trying to understand how a specific feature or route works, Claude often has to issue dozens of search queries and read whole files sequentially.

On complex codebases, this discovery loop burns tens of thousands of tokens before Claude even starts writing code.

I looked at three popular code knowledge graph projects to see if they could solve this:
1. The first required cloud backends or external database servers, creating friction and privacy concerns.
2. The second only parsed static ASTs, which missed runtime framework routing (like Express or FastAPI handlers).
3. The third dumped large raw text summaries back into the context window, causing the same token problem.

None of them fit a clean, local agent setup. So I decided to build PigeonGraph.

---

### What was built

PigeonGraph is a local, in-memory code knowledge graph and Model Context Protocol (MCP) server.

Instead of making 15 to 30 tool calls to find code relationships, Claude makes one call to the MCP server (`pigeongraph explore <symbol>`) and receives:
- Exact symbol definitions and line numbers across 7 languages (TS, JS, Python, Rust, Go, Java, C/C++).
- Dynamic route dispatch links (such as HTTP endpoints connected to controllers).
- Inbound and outbound call hierarchies.
- Blast radius calculations.

The database runs entirely in-process using Node 24 native SQLite with WAL mode. There are zero external servers, zero background daemons, and zero telemetry.

---

### How Claude helped build it

I built PigeonGraph specifically for Claude, using Claude Code throughout the process:
- Architecture and schema: Claude Code helped draft and refine the multi-layer graph schema in TypeScript.
- Route synthesis: Claude helped map out the dynamic dispatch patterns used in web frameworks like Express, Gin, and FastAPI so the parser could connect routes to handlers across files.
- Benchmark validation: Claude Code ran the evaluation suite against real-world repos (Express, FastAPI, Zustand, Ripgrep) to measure turn counts and token savings.

---

### What I learned from the project

- Raw file reads waste valuable context. Providing pinpointed call chains and signatures lets Claude spend its context window on logic and reasoning rather than navigating boilerplate.
- Static ASTs are not enough for modern web applications. If a tool cannot connect an HTTP route to its handler function, the agent will still fall back to grep loops.
- Local-first tooling is practical. With Node 24 native SQLite WAL, symbol and call chain lookups take less than 1 millisecond locally without needing an external service.

---

### Measured results

In empirical benchmark tests:
- Express request handler tracing: dropped from 29 turns (102,316 tokens) to 1 turn (629 tokens).
- FastAPI dependency solving: dropped from 3 turns (252,210 tokens) to 1 turn (394 tokens).
- Overall exploration token usage dropped by 90% to 99% across tested repositories.

---

### Free to use and open source

PigeonGraph is completely free and licensed under MIT:
- Repository: https://github.com/Hoppy-Beast/pigeongraph
- Browser Colab Demo: https://colab.research.google.com/github/Hoppy-Beast/pigeongraph/blob/main/assets/pigeongraph_demo.ipynb

If you work with large codebases in Claude, feel free to try it out, fork it, or modify it for your own needs. If you find it helpful, leaving a star on GitHub or contributing an issue or PR is easy and welcome.

---

## 4. Hacker News Show HN post

### Post title
`Show HN: PigeonGraph – Local in-memory code graph and MCP server for agents`

### Post body
Hi HN,

I built PigeonGraph after getting frustrated by how many tokens and tool turns coding agents waste just finding their way around an unfamiliar codebase.

When an agent lands on a new repository, it typically relies on repeated grep and file reads. On medium-sized codebases, that often means 15 to 30 tool calls and tens of thousands of wasted tokens before any useful work begins.

I looked at three popular code knowledge graph repositories before building this. Each had good qualities, but none quite worked for my workflow. One required cloud infrastructure or external databases, one only supported static syntax trees without dynamic route wiring, and one dumped large chunks of code back into the context window.

PigeonGraph is an attempt to address those gaps in a self-contained, local tool:
- Deterministic AST extraction across TypeScript, JavaScript, Python, Rust, Go, Java, and C/C++.
- Dynamic dispatch synthesis to connect HTTP routes (Express, FastAPI, Gin, Flask) and event emitters to their handlers.
- Native SQLite WAL storage via Node 24 (no separate database service, no telemetry).
- Single-turn MCP queries (`pigeongraph explore <symbol>`) that return definitions, call paths, and blast radius in one shot.

In tests on repos like Express and FastAPI, query token consumption dropped by 90% or more compared to raw grep baselines.

It is completely free and open source under the MIT license. Feel free to use it or adapt it for your own needs. If you would like to contribute or leave a star, it is easy to do so and greatly appreciated.

Repo: https://github.com/Hoppy-Beast/pigeongraph  
Colab demo: https://colab.research.google.com/github/Hoppy-Beast/pigeongraph/blob/main/assets/pigeongraph_demo.ipynb

I would be glad to answer questions about the graph schema or the route synthesis implementation.

### Maker's first comment on HN
> A quick note on the storage and parsing design:
>
> We avoided heavy graph databases (like Neo4j) or external search daemons because developer tools should be easy to run locally without background overhead.
>
> Layer 1 parsing runs locally via regex and syntax heuristics, meaning AST generation costs zero LLM tokens. The graph is stored in Node 24 native SQLite using WAL mode and FTS5. Lookups for symbol chains take under 1 millisecond.
>
> Happy to answer questions about the multi-clock schema or the route synthesis heuristics.

---

## 5. X / Twitter launch thread

### Tweet 1 (Main post)
I got tired of watching coding agents burn thousands of tokens and 20+ search turns just trying to find a function in a repo.

I tried 3 popular code graph tools, but none fit a real agent workflow. So I built PigeonGraph.

Local, in-memory, MCP-ready, and 100% free (MIT):  
https://github.com/Hoppy-Beast/pigeongraph

*(Attach your repository screenshot or workflow clip)*

### Tweet 2 (The gap in existing tools)
The trade-offs with existing tools:
- Some need cloud setups or external databases
- Some only parse static ASTs, missing Express or FastAPI routes
- Some dump entire files into context, repeating the same token burn

### Tweet 3 (Proof and architecture)
PigeonGraph runs locally on Node 24 native SQLite with WAL.

Instead of 20 grep calls, an agent asks once and gets the symbol, route links, and call hierarchy in one turn.

On Express, that took discovery from 29 turns (102k tokens) to 1 turn (629 tokens).

### Tweet 4 (Star and contribution ask)
It is completely free and open source. Feel free to use it, fork it, or modify it for your own setup.

If you find it helpful, please consider leaving a star on GitHub or jumping in to contribute.

Repo: https://github.com/Hoppy-Beast/pigeongraph  
Colab demo: https://colab.research.google.com/github/Hoppy-Beast/pigeongraph/blob/main/assets/pigeongraph_demo.ipynb

---

## 6. Product Hunt launch submission

### Tagline (under 60 characters)
In-memory code knowledge graph and MCP server for AI agents

### Short description
PigeonGraph stops coding agents from wasting 20+ turns on grep loops. It builds an in-memory knowledge graph locally with Node 24 SQLite WAL, connecting AST symbols and dynamic runtime routes for Claude, Cursor, and Gemini in a single turn. 100% local, MIT licensed.

### Maker comment on Product Hunt
> Hey Product Hunt,
>
> I built PigeonGraph because I was spending too many tokens watching Claude Code and Cursor loop through grep searches on medium-sized repositories.
>
> I tried existing code graph projects, but they either required cloud services, missed runtime route handlers, or dumped too much raw text back into the prompt.
>
> PigeonGraph is completely local, runs in Node 24 with native SQLite WAL, and exposes an MCP server that gives agents exact call chains and route links in one turn.
>
> It is 100% free, open source under the MIT license, and easy to run. I would love your feedback, stars, and contributions on GitHub.

### Product Hunt: Connect with Investors questionnaire

#### Question 1: Why are you the right founder/team to work on this?
> I am a software engineer who builds and dogfoods AI agent infrastructure on production-sized codebases every day. I built PigeonGraph from the ground up, writing the multi-language AST extraction engine across seven languages, the runtime route synthesizers, the Graphology in-memory traversal layer, and the native Node 24 SQLite WAL storage.
>
> Many developers trying to solve agent memory approach it from a high-level wrapper perspective, throwing more prompts or vector embeddings at the problem. My background is in systems architecture, compiler ASTs, and developer tooling. I understand why coding agents fail at the protocol level: vector search finds loose semantic similarity, but agents need strict structural ground truth (exact call hierarchies, route bindings, and blast radius).
>
> Because I use tools like Claude Code, Cursor, and Antigravity for my own engineering work, I build strictly around real developer friction rather than theoretical use cases. When an agent burns tokens or misses a route handler, I see it immediately and fix the underlying graph representation.

#### Question 2: Why did you pick this idea to work on?
> I picked this idea out of direct frustration with my own daily development workflow.
>
> In 2024 through 2026, AI coding agents evolved from single-line autocomplete into autonomous agents that plan and execute multi-file changes. But when you drop an agent into an unfamiliar codebase with more than fifty files, it behaves like a blind person in a dark room. It runs fifteen to thirty sequential grep commands, reads entire files from top to bottom, and burns tens of thousands of tokens before it writes a single line of code. Frequently, the context window fills up, the agent loses track of the original objective, and you have to restart the prompt.
>
> I searched for solutions and tested three popular open source code graph projects. None of them worked in a real agent workflow. One required external cloud servers and databases, introducing privacy friction for proprietary code. Another only parsed static syntax trees, which completely missed runtime framework routes like Express or FastAPI handlers. The third dumped massive ASCII trees or text summaries back into the prompt, creating the exact same token exhaustion problem it claimed to solve.
>
> I realized that coding agents do not need more text dumps. They need an in-memory structural index that connects static syntax to runtime dispatch and answers architecture questions in a single turn. That is why I built PigeonGraph.

#### Question 3: Who are your competitors, and what do you understand about this idea that they don't?
> Our competitors fall into three categories:
> 1. Cloud-based enterprise code intelligence platforms (such as Sourcegraph, Augment, or proprietary indexing services).
> 2. Static AST code analyzers and graph tools (such as GitNexus, Graphify, or Tree-sitter wrapper scripts).
> 3. Context dumping tools (such as Repomix or simple repo-to-prompt bundlers).
>
> Here is what we understand that competitors miss:
>
> First, static syntax analysis is blind to modern web and backend architecture. In frameworks like Express, FastAPI, Gin, and Flask, functions are linked dynamically through route registrations or event emitters, not static function calls. When an agent queries who handles a GET request, static AST tools return nothing, forcing the agent back into expensive grep loops. PigeonGraph explicitly synthesizes runtime dispatch links across modules.
>
> Second, token density beats context size. Dumping full file contents or large graph serializations into an agent context wastes money and degrades model reasoning. PigeonGraph returns compact, pinpointed symbol definitions, line coordinates, and call chains in a single sub-millisecond turn, reducing token consumption by 90% to 99%.
>
> Third, local-first and zero-server infrastructure is mandatory for developer adoption. Developers and security-conscious companies do not want to upload their proprietary codebases to third-party indexing clouds or manage heavy Docker containers on their laptops. PigeonGraph runs entirely in-process using Node 24 native SQLite with WAL mode, producing zero network telemetry and sub-millisecond query latencies.
>
> Fourth, Layer 1 parsing must be deterministic and cost zero tokens. Using LLM calls to parse basic code syntax is wasteful. PigeonGraph extracts syntax deterministically on the local CPU, saving LLM tokens exclusively for reasoning and code generation.

#### Question 4: What's your revenue and/or growth rate?
> PigeonGraph is currently an early-stage, pre-revenue open source project ($0 ARR) licensed under MIT.
>
> Our focus to date has been on proving technical differentiation and performance metrics across established open source codebases (Express, FastAPI, Zustand, Ripgrep). In empirical evaluations, PigeonGraph consistently reduced agent exploration token consumption from over 100,000 tokens across 20+ turns down to under 700 tokens in 1 turn, with query latencies under 50 milliseconds.
>
> Initial user adoption is driven through open source channels: the GitHub repository, an interactive Google Colab demo that lets developers test exploration queries without local installation, and registrations in Model Context Protocol (MCP) community registries.
>
> Our commercialization strategy centers on an open-core enterprise model:
> 1. Self-hosted enterprise edition: Cross-repository graph federation, multi-user permissions, and compliance auditing for private engineering teams.
> 2. Team context synchronization: Centralized indexing for continuous integration pipelines, allowing entire engineering teams to share pre-computed graph states across Claude Code and Cursor seats.
> 3. High-security environments: Air-gapped deployments for defense, healthcare, and financial institutions that require local-first agent navigation with zero external telemetry.

#### Question 5: Anything else you would like investors to know?
> The software industry is undergoing a structural transition from "AI as an autocomplete assistant" to "AI as an autonomous agent engineer."
>
> In this new paradigm, the bottleneck is no longer how fast a model can generate code; it is how accurately and cheaply an agent can navigate a complex codebase. Today, companies deploying tools like Claude Code, Cursor, and internal agent workflows are seeing substantial token bills and frequent task failures caused solely by bad repository navigation.
>
> PigeonGraph operates as an essential infrastructure layer for this ecosystem. By integrating natively via the Model Context Protocol (MCP), we fit directly into the existing developer toolchain without requiring engineers to switch editors or change how they work.
>
> We are building the structural ground truth engine for AI software engineering: local, deterministic, and fast. If you are interested in the intersection of developer infrastructure, local-first computing, and autonomous AI agents, we would welcome a conversation.

---

## 7. MCP registry submissions

### Awesome MCP Servers (`github.com/punkpeye/awesome-mcp-servers`)
Submit a PR adding this row to the Development Tools table:
```markdown
- [PigeonGraph](https://github.com/Hoppy-Beast/pigeongraph) - Local in-memory code knowledge graph and MCP server for AI coding agents. Provides 1-turn architectural exploration with dynamic route synthesis and 90%+ token reduction.
```

### PulseMCP (`pulsemcp.com`) & Glama (`glama.ai/mcp/servers`)
- Name: PigeonGraph
- Repository: https://github.com/Hoppy-Beast/pigeongraph
- License: MIT
- Primary category: Developer Tools / Code Intelligence
- Description: In-memory code knowledge graph and MCP server for Claude Code, Cursor, Antigravity, and Gemini. Resolves symbols, dynamic routes, and call chains locally with native Node 24 SQLite WAL.

---

## 8. Distribution and engagement rules

1. **Reddit sequencing:**
   - Post to `r/ClaudeCode` first.
   - Wait 24 hours before posting to `r/ClaudeAI` (confirm your account has >100 karma).
   - Wait another 24 to 48 hours before posting to `r/LocalLLaMA` or `r/programming`. This prevents spam filter detection and lets you incorporate early feedback into later posts.
2. **Hacker News timing:**
   - Post `Show HN` on a Tuesday or Wednesday between 8:00 AM and 9:30 AM US Eastern Time (EST).
3. **Comment responsiveness:**
   - Stay online for the first two hours after posting. Answer technical questions about Node 24 compatibility, how dynamic dispatch works, and how it compares to standard grep. Prompt and respectful replies drive community upvotes.
