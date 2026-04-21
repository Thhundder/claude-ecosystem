# CLAUDE.md

Guidance for Claude Code when working in this codebase. This file is a template — tune the "Stack" and "Project-specific" sections for each project.

---

## Core behavior

- **Be surgical, not broad.** Don't refactor, rename, or restructure code beyond what the task requires. A bug fix doesn't need surrounding cleanup.
- **Default to writing no comments.** Only add a comment when the *why* is non-obvious. Never describe *what* the code does — well-named code does that.
- **No abstractions until the pressure is real.** Three similar lines is fine. YAGNI.
- **No error handling for impossible cases.** Trust internal contracts. Validate only at system boundaries (user input, external APIs).
- **No backwards-compat shims** unless the user explicitly asks. Delete dead code completely — don't comment it out or leave `// removed` notes.
- **Never use `git --no-verify`, `--no-gpg-sign`, or any hook bypass** unless the user explicitly asks. If a hook fails, fix the underlying issue.
- **Never commit secrets.** Check `.env*`, credential files, and obvious key names before `git add`.
- **When in doubt, ask before running destructive actions** (force push, hard reset, dropping tables, killing processes).

## Research before coding

**Mandatory sequence** when implementing anything non-trivial:

1. **GitHub search first** — `gh search repos`, `gh search code` for existing implementations and patterns.
2. **Library docs via Context7** — never code against training-data memory for an API, it's likely stale.
3. **Package registries** — npm/PyPI/crates.io for battle-tested libraries before writing utility code.
4. **Exa / deep-research skill** only when the first three are insufficient.

Prefer adopting or porting a proven approach over writing net-new code.

## Planning

For any feature touching ≥3 files or introducing new architecture:

1. Use the **`planner`** agent or `/plan` slash command.
2. Generate a phased plan with risks and dependencies.
3. Wait for user confirmation before writing code.
4. Use `blueprint` skill for multi-session projects.
5. For genuinely ambiguous decisions, convene a **`council`** — four structured voices arguing before you choose.

## TDD loop

1. Red — write a failing test, confirm it fails for the right reason.
2. Green — minimal implementation.
3. Refactor — with tests green.
4. Verify coverage didn't drop below 80%.

Use the **`tdd-guide`** agent proactively. See `rules/testing.md` for framework defaults (pytest, bun test, Playwright).

## Code review after every change

Run in **parallel** whenever possible:

- `code-reviewer` — general quality
- `security-reviewer` — any code touching auth, inputs, secrets, DB, external APIs
- `typescript-reviewer` / `python-reviewer` / `cpp-reviewer` — language-specific smells
- `performance-optimizer` — hot paths, DB queries, voice latency

Block on CRITICAL, warn on HIGH. See `rules/code-review.md` for severity levels.

## Voice AI / RAG / MCP

When the project involves voice agents, RAG, or MCP servers, the dedicated rule files apply:

- Voice agents over telephony → `rules/voice-ai-best-practices.md` (latency budgets, cost caps, robustness, security)
- RAG / retrieval pipelines → `rules/rag-best-practices.md` (chunking, hybrid search, rerank, eval)
- Building MCP servers → `rules/mcp-server-best-practices.md` (transport, tool design, schema, security)

## Cost awareness

- Default model is **Sonnet 4.6**. Upgrade to **Opus 4.6** for architecture/planning/security review. Downgrade to **Haiku 4.5** for parallel subagents and mechanical transformations.
- Voice sessions are expensive — cap session duration, cap silence, alarm on cost.
- Enable **prompt caching** on stable system prompts for ~90% cost savings.
- Batch embeddings. Cache by content hash.
- Use `/context-budget`, `token-budget-advisor`, and `strategic-compact` skills to stay lean.

## Bun-first (for JS/TS projects)

When the project is JavaScript/TypeScript without an explicit Node requirement:

- Use `bun` / `bunx` / `bun test` / `bun install` instead of npm/yarn/pnpm equivalents.
- Prefer `Bun.serve`, `bun:sqlite`, `Bun.redis`, `Bun.sql`, `Bun.file`, `Bun.$`. Avoid pulling in `express`, `better-sqlite3`, `ioredis`, `pg`, `postgres.js`, `node:fs`, `execa`, `dotenv`.
- HTML imports with `Bun.serve()` for frontend; don't reach for Vite.
- This default does **not** apply to projects that are explicitly Python/C/C++/other.

## Git discipline

- Conventional commits: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`, `ci`.
- One concern per commit. Split unrelated changes.
- Commit messages explain **why**. The diff shows what.
- Prefer new commits over `--amend` on published commits.
- Never force-push to main/master. Warn the user first even if asked.

## When you're stuck

- Don't hide the problem. State it directly.
- Don't use destructive commands as a shortcut (`git reset --hard`, `rm -rf`, `--no-verify`) to make an obstacle go away. Find the root cause.
- Use `silent-failure-hunter` agent for production regressions.
- Use `agent-introspection-debugging` skill for agent-level failures.
- Use `workflow-debug` skill for structured 5-step error debugging.

---

## Stack

*(Tune per project)*

**Example — Xeko voice AI stack**:
- Python 3.12, FastAPI, async throughout
- Next.js / TypeScript frontend (widget + admin)
- MongoDB (motor) + ChromaDB (vector store)
- Telnyx Call Control API + Voice Streaming (bidirectional WS PCMU 8kHz)
- OpenAI Realtime API (gpt-realtime-*) for voice + reasoning
- LangChain for orchestration, LangSmith for traces/evals
- Custom MCP servers for accommodations, calendar, leads routing

## Project-specific commands

*(Add as needed)*

```bash
# Example
bun test              # tests
bun run lint          # lint
pytest --cov=src      # python tests with coverage
docker compose up     # local stack
```

## Keys files and entry points

*(Add as needed)*

- `src/main.py` — FastAPI app entry
- `src/telnyx/` — telephony integration
- `src/realtime/` — OpenAI Realtime client
- `src/rag/` — RAG pipeline
- `src/mcps/` — custom MCP servers

---

## Skills that auto-activate in this codebase

*(These light up automatically based on file paths and task descriptions.)*

- `context7-mcp` / `documentation-lookup` on any library usage
- `bun-runtime` on `*.ts`/`*.tsx`/`package.json` in Bun projects
- `python-patterns` / `python-testing` on `*.py`
- `frontend-design` / `frontend-patterns` / `nextjs-turbopack` / `accessibility` on frontend
- `telnyx-voice-python` / `telnyx-voice-streaming-python` on Telnyx files
- `iterative-retrieval` / `rag-best-practices` on RAG pipeline files
- `mcp-builder` / `mcp-server-patterns` on MCP server code
- `cost-aware-llm-pipeline` / `eval-harness` on LLM client code
