# CLAUDE.md

Guidance for Claude Code when working in this codebase. This file is a template — tune the **Stack** and **Project-specific** sections per project. The universal doctrine lives in `rules/` and is loaded via `~/.claude/CLAUDE.md` — don't restate it here.

---

## Doctrine (loaded from rules/)

The full Always/Never list, coding style, security checklist, dev workflow, agent orchestration, and TDD policy are in:

- `rules/core/must-always-must-never.md`
- `rules/core/coding-style.md`
- `rules/core/security.md`
- `rules/workflow/development-workflow.md`
- `rules/workflow/agent-orchestration.md`
- `rules/quality/testing.md`

These are referenced from `~/.claude/CLAUDE.md` so they're always in context. Don't duplicate them in this file.

## Project-only additions

### Voice AI / RAG / MCP rules (only when applicable)

- Voice agents over telephony → `rules/voice-ai-best-practices.md`
- RAG / retrieval pipelines → `rules/rag-best-practices.md`
- Building MCP servers → `rules/mcp-server-best-practices.md`

### Cost awareness (model + caching)

- Default model: **Sonnet 4.6**. Upgrade to Opus for architecture/planning/security review. Downgrade to Haiku for parallel subagents and mechanical transformations.
- Voice sessions: cap duration, cap silence, alarm on cost.
- Enable **prompt caching** on stable system prompts (~90% savings).
- Batch embeddings; cache by content hash.
- Use `/context-budget`, `token-budget-advisor`, `strategic-compact` to stay lean.

### Bun-first (JS/TS projects only)

When the project is JavaScript/TypeScript without an explicit Node requirement:

- `bun` / `bunx` / `bun test` / `bun install` instead of npm/yarn/pnpm.
- Prefer `Bun.serve`, `bun:sqlite`, `Bun.redis`, `Bun.sql`, `Bun.file`, `Bun.$`. Avoid `express`, `better-sqlite3`, `ioredis`, `pg`, `postgres.js`, `node:fs`, `execa`, `dotenv`.
- HTML imports with `Bun.serve()` for frontend; don't reach for Vite.

### Stuck? Use these tools

- `silent-failure-hunter` agent — production regressions
- `workflow-debug` skill — structured 5-step error debugging
- `agent-introspection-debugging` skill — agent-level failures

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
bun test              # tests
bun run lint          # lint
pytest --cov=src      # python tests with coverage
docker compose up     # local stack
```

## Key files and entry points

*(Add as needed)*

- `src/main.py` — FastAPI app entry
- `src/telnyx/` — telephony integration
- `src/realtime/` — OpenAI Realtime client
- `src/rag/` — RAG pipeline
- `src/mcps/` — custom MCP servers

---

## Skills that auto-activate

*(Lit up by file paths / task descriptions.)*

- `documentation-lookup` on any library usage
- `bun-runtime` on `*.ts`/`*.tsx`/`package.json` in Bun projects
- `python-patterns` / `python-testing` on `*.py`
- `frontend-design` / `frontend-patterns` on frontend
- `telnyx-voice-python` / `telnyx-voice-streaming-python` on Telnyx files
- `rag-best-practices` on RAG pipeline files
- `mcp-builder` / `mcp-server-patterns` on MCP server code
- `cost-aware-llm-pipeline` / `eval-harness` on LLM client code
