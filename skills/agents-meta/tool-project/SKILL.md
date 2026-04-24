---
name: tool-project
description: "Use when entering a new repo, starting a fresh project, or re-evaluating an existing project's Claude tool setup — detects the project's stack (language, framework, domain signals), matches it against INDEX-PROJECT.md, proposes a curated set of per-project skills to symlink into <project>/.claude/skills/, and writes a RESEARCH.md explaining every choice. TRIGGER: 'new project', 'starting project', 'project setup', 'install tools for this project', 'reevaluate tools', '/tool-project', first session in a repo that lacks .claude/, cloned a new repo. SKIP: repo already has a .claude/ configured (unless user explicitly asks to re-evaluate), single-file scripts / non-project directories, tasks unrelated to project bootstrap."
origin: ECC
---

# Tool Project

Bootstrap or re-evaluate a repo's Claude toolbelt. Detects project signals, matches against the ecosystem's per-project skills catalog (`INDEX-PROJECT.md`), proposes a curated install, and documents every decision in `<project>/.claude/RESEARCH.md`.

**Principle: symlinks, not copies.** Links into `~/Documents/claude-ecosystem/skills/`, so any ecosystem update flows automatically. Agents, commands, and rules are already globally active via `~/.claude/` — this skill only manages **per-project skills**.

## Activation check

Only run inside a real project (has at least one manifest file or git repo). Confirm:

```bash
git rev-parse --show-toplevel 2>/dev/null || pwd
ls package.json pyproject.toml requirements.txt Cargo.toml go.mod pom.xml build.gradle CMakeLists.txt Dockerfile 2>/dev/null | head
```

If the cwd looks like the ecosystem repo itself, **stop** — this skill is for consumer projects, not for the ecosystem.

---

## Phase 1 — Detect project signals

Scan the repo for stack + domain signals. **Read shallowly** (headers / dependencies / top-level imports). Don't exhaustively walk the codebase.

### 1.1 — Language / runtime manifests

| File present | Signal |
|---|---|
| `package.json` | JS/TS project — parse `dependencies` + `devDependencies` + `engines` |
| `bun.lock` / `bun.lockb` | Bun runtime specifically |
| `pnpm-lock.yaml`, `yarn.lock`, `package-lock.json` | Alternative JS manager |
| `pyproject.toml`, `requirements*.txt`, `Pipfile`, `setup.py` | Python |
| `Cargo.toml` | Rust |
| `go.mod` | Go |
| `pom.xml`, `build.gradle` | Java/Kotlin |
| `CMakeLists.txt`, `*.cpp`, `*.hpp` | C++ |
| `Gemfile` | Ruby |
| `composer.json` | PHP |

### 1.2 — Framework / library dependencies

Scan manifest entries for known signals:

| Dep keyword | Matched skill category |
|---|---|
| `react`, `next`, `vue`, `svelte` | frontend |
| `tailwindcss`, `@radix-ui`, `shadcn` | frontend + design-system |
| `playwright`, `@playwright/test` | testing (playwright-qa, webapp-testing) |
| `fastapi`, `flask`, `django`, `express`, `hono` | backend (api-design) |
| `prisma`, `drizzle-orm`, `kysely`, `sqlalchemy`, `alembic` | backend (database-migrations) |
| `anthropic`, `@anthropic-ai/sdk` | LLM / cost-aware-llm-pipeline |
| `openai` | LLM / cost-aware-llm-pipeline |
| `chromadb`, `pinecone`, `weaviate`, `qdrant`, `pgvector`, `langchain`, `llama-index` | RAG (rag-best-practices) |
| `telnyx` | voice (telnyx-*, voice-ai-best-practices) |
| `twilio`, `livekit`, `vapi`, `pipecat` | voice (voice-ai-best-practices, no telnyx sdk) |
| `pytest`, `pytest-asyncio` | testing (python-testing) |
| `jest`, `vitest` | testing |
| `GoogleTest`, `gtest` headers | testing (cpp-testing) |

### 1.3 — Infrastructure signals

| Signal | Matched skill |
|---|---|
| `Dockerfile`, `docker-compose.yml`, `.dockerignore` | docker-patterns |
| `.github/workflows/`, `.gitlab-ci.yml`, `Jenkinsfile` | deployment-patterns |
| `migrations/`, `alembic/`, `prisma/migrations/` | database-migrations |
| Multiple existing connectors (e.g. `*/providers/*.ts`, `integrations/*.py` with 2+ entries) | api-connector-builder |

### 1.4 — Code-level signals (shallow)

Scan only **the top 50-100 files at the surface** (entry points, src root) for imports. Don't walk every file.

```bash
# JS/TS entry imports (top-level src files)
rg -l "from ['\"]anthropic['\"]|from ['\"]openai['\"]|from ['\"]telnyx['\"]" \
   src/ app/ lib/ 2>/dev/null | head -20

# Python entry imports
rg -l "^import (anthropic|openai|telnyx|chromadb|langchain)|^from (anthropic|openai|telnyx|chromadb|langchain) " \
   --type py --max-count 1 2>/dev/null | head -20
```

### 1.5 — README + CLAUDE.md hints

If `README.md` / `CLAUDE.md` exists, read top 60 lines for explicit mentions of domain (voice AI, RAG, API, admin, widget, etc.).

### 1.6 — Build a signal summary

Output a compact internal summary — not shown to user yet:

```
{
  "language": ["typescript", "python"],
  "runtime": "bun",
  "frameworks": ["next", "fastapi"],
  "deps": ["anthropic", "chromadb", "langchain"],
  "infra": ["docker", "github-actions"],
  "domain_hints": ["RAG", "LLM"]
}
```

---

## Phase 2 — Match against `INDEX-PROJECT.md`

### 2.1 — Load catalog

```bash
cat ~/Documents/claude-ecosystem/INDEX-PROJECT.md
```

### 2.2 — Score each per-project skill

For every skill listed in `## Per-Project Skills`, compute a score:

- **+3** if a TRIGGER keyword matches a detected dependency or signal
- **+2** if a TRIGGER keyword matches a framework signal
- **+1** if a TRIGGER keyword matches an infra signal
- **−3** if a SKIP keyword clearly applies (e.g. SKIP says "non-Python files" and project has no Python)
- **−5** if the category mismatches entirely (e.g. frontend skill but no UI deps)

Keep only skills with score ≥ 2. Order by score descending.

### 2.3 — Avoid over-install

Cap the proposal at **15 skills max**. If the project is clearly narrow (e.g. a pure CLI tool), the proposal will naturally be short — don't pad.

### 2.4 — Detect existing `<project>/.claude/skills/`

```bash
ls "$(pwd)/.claude/skills/" 2>/dev/null
```

If skills already installed: classify each as
- **keep** — still in the new proposal → leave as-is
- **add** — in new proposal but missing → will symlink
- **remove** — present but not matched anymore → propose removal (don't force)

---

## Phase 3 — Present the proposal (2 tables)

Show the user **both tables** before any write. Keep columns tight.

### Table A — Why (compact, for quick scan)

| Skill | Category | Why it matched |
|---|---|---|
| `rag-best-practices` | domain | dep `chromadb` + `langchain` → RAG signals |
| `cost-aware-llm-pipeline` | context-cost | dep `anthropic` + `openai` → LLM project |
| `database-migrations` | backend | dep `prisma` + `prisma/migrations/` folder |
| … | | |

### Table B — Details (for the curious)

| Skill | Trigger keywords matched | Install path | Action |
|---|---|---|---|
| `rag-best-practices` | ChromaDB, LangChain, chunk | `<proj>/.claude/skills/rag-best-practices` | ADD |
| `cost-aware-llm-pipeline` | anthropic, openai SDK | `<proj>/.claude/skills/cost-aware-llm-pipeline` | ADD |
| `database-migrations` | prisma, migrations/ | already linked | KEEP |
| `python-patterns` | pyproject.toml, .py files | `<proj>/.claude/skills/python-patterns` | ADD |
| `frontend-design` | | | REMOVE (no UI deps) |

### Prompt the user

```
Proposal: 12 skills to install, 2 to keep, 1 to remove.

Options:
  1. accept all
  2. accept + edit (give me the skills to drop or add)
  3. show me the full description of skill <name>
  4. cancel
```

Wait for explicit choice.

---

## Phase 4 — Execute

### 4.1 — Create `<project>/.claude/` scaffolding if missing

```bash
mkdir -p "$(pwd)/.claude/skills"
```

### 4.2 — Apply the approved diff

For each skill marked ADD in the approved plan:

```bash
ln -sf ~/Documents/claude-ecosystem/skills/<category>/<name> \
       "$(pwd)/.claude/skills/<name>"
```

For each skill marked REMOVE (user approved):

```bash
rm "$(pwd)/.claude/skills/<name>"
```

For KEEP: no-op.

### 4.3 — Write `<project>/.claude/RESEARCH.md`

This file documents **why** each skill was chosen — written for future-you or your teammates.

Format:

```markdown
# Tool Project — Research Report

Generated by `tool-project` skill on <ISO date>.

## Project signals

- Language: <detected>
- Runtime: <detected>
- Frameworks: <list>
- Dependencies of interest: <list>
- Infrastructure: <list>
- Domain hints: <list>

## Installed skills — quick summary

| Skill | Category | Why |
|---|---|---|
| `rag-best-practices` | domain | ChromaDB + LangChain deps → RAG project |
| `cost-aware-llm-pipeline` | context-cost | anthropic + openai deps → LLM app |
| … | | |

## Installed skills — full rationale

### `rag-best-practices`

- **Category**: domain
- **Install path**: `.claude/skills/rag-best-practices` → symlink to `~/Documents/claude-ecosystem/skills/domain/rag-best-practices/`
- **Trigger keywords matched**: ChromaDB, LangChain, chunk, vector search
- **Project signal**: `package.json` has `chromadb` and `langchain`; `src/rag/` folder exists
- **Why needed**: This repo is a RAG pipeline. The skill covers ingestion/retrieval/generation separation, chunking strategy, hybrid search, reranking, and RAG-specific eval patterns.
- **Ecosystem entry**: `INDEX-PROJECT.md` → Per-Project Skills → `rag-best-practices`

### `cost-aware-llm-pipeline`

- **Category**: context-cost
- **Install path**: …
- **Trigger keywords matched**: anthropic, openai SDK
- **Project signal**: both SDKs in `package.json`
- **Why needed**: LLM pipeline with budget concerns — covers model routing (Haiku/Sonnet/Opus), prompt caching, retry+backoff, cost tracking.
- **Ecosystem entry**: …

…

## Considered but not installed

| Skill | Reason for skipping |
|---|---|
| `frontend-design` | No React/Vue/Next — pure backend repo |
| `telnyx-*` (7) | No Telnyx SDK in deps |

## How to update

- **Project evolves** (new deps added, domain shifts): re-run `/tool-project` to re-evaluate.
- **Need one specific tool**: run `/tool-finder` with a description of what you need.
- **Ecosystem updated**: run `/rebuild-ecosystem-index` in the ecosystem repo, then re-run `/tool-project` here if the diff suggests new matches.
```

### 4.4 — Report

Final message to the user:

```
DONE. Installed 12 skills into <project>/.claude/skills/ (symlinks).
Summary + rationale written to <project>/.claude/RESEARCH.md.

Agents, commands, and the 6 core rules are already active globally — no per-project install needed.

Restart Claude Code or open /hooks so the new skills load.
```

---

## Rules the skill follows

- **Never** overwrite existing files without user approval. Symlinks OK to recreate (idempotent via `ln -sf`).
- **Never** install universal skills per-project — they're already at `~/.claude/skills/`.
- **Never** touch `<project>/.claude/settings.json`, hooks, or agents — those are project-team decisions. This skill only manages `skills/`.
- **Always** write `RESEARCH.md` — it's the user-visible audit trail.
- **Always** show both tables (summary + details) before writing.
- **Always** cap proposals at 15 skills. If you want more, that's tool-finder's territory.
- **Always** respect the ecosystem path — read from `~/Documents/claude-ecosystem/`, never from stale copies.

---

## Related tools

- `/rebuild-ecosystem-index` — refresh `INDEX-PROJECT.md` if the ecosystem changed recently
- `tool-finder` skill (to come) — feature-level tool lookup (add one specific skill without re-running the full bootstrap)
- `/ecosystem-sync` — for pushing changes to the ecosystem itself (not this project)
