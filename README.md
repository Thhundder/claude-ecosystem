# claude-ecosystem

A project-agnostic library of Claude Code tools — agents, skills, commands, and rules. Universal tools are activated globally via `~/.claude/` symlinks; specialized tools are installed per-project by meta-skills that match each repo's stack.

## Layout

```
claude-ecosystem/
├── agents/              # 13 universal agents (analysis, architecture, review)
├── commands/            # 10 universal slash commands
├── rules/               # 6 global rules (@-referenced from ~/.claude/CLAUDE.md)
├── skills/              # 44 skills
│   ├── agents-meta/     # meta-tools (includes tool-project, tool-finder, workflow-apex, …)
│   ├── analysis/        # codebase-onboarding, deep-research, documentation-lookup, explore
│   ├── backend/         # api-design, database-migrations, deployment-patterns, …
│   ├── context-cost/    # context-budget
│   ├── domain/          # rag-best-practices, voice-ai-best-practices
│   ├── frontend/        # design-system, frontend-design, frontend-patterns
│   ├── quality/         # code-review-standards, fix-errors
│   ├── telnyx/          # 7 Telnyx SDK wrappers
│   └── testing/         # benchmark, eval-harness, playwright-qa, tdd-workflow, …
├── eco/                 # tools that manage THIS repo (excluded from the INDEX)
│   ├── commands/        # rebuild-ecosystem-index, sync-claude-config,
│   │                    # reset-claude-baseline, extend-claude-baseline
│   └── skills/          # ecosystem-sync
├── config-claude/       # versioned mirror of ~/.claude/ baseline
│                        #   (CLAUDE.md, settings.json, .mcp.json)
├── scripts/
│   └── build-index.py   # generates INDEX.md + INDEX-PROJECT.md
├── INDEX.md             # full catalog — consumed by tool-finder
├── INDEX-PROJECT.md     # filtered view (per-project skills only) — consumed by tool-project
└── CLAUDE.md            # repo-level directive when working ON this repo
```

## How it is used

Two layers:

1. **Global** — tools symlinked into `~/.claude/` so they're active in every session, every project. Universal by nature (code-reviewer, planner, tdd-guide, etc.).
2. **Per-project** — specialized tools installed into `<project>/.claude/skills/` by the meta-skills below. Picked based on each repo's stack.

## Meta-skills

| Skill | When to use |
|---|---|
| `tool-project` | Bootstrapping or re-evaluating a repo. Scans signals, score-matches `INDEX-PROJECT.md`, symlinks a curated set, writes `<project>/.claude/RESEARCH.md`. |
| `tool-finder` | Specific feature need in natural language. Returns top-3 candidates with a verdict: already-active / install / create-new / no-match. |
| `ecosystem-sync` | Before pushing THIS repo. 3-phase pre-push audit: drift check `~/.claude/` ↔ `config-claude/`, smart INDEX refresh (incremental from git-status), commit summary with user approval. |

## Eco commands (manage this repo)

| Command | Role |
|---|---|
| `/rebuild-ecosystem-index` | Regenerate `INDEX.md` + `INDEX-PROJECT.md`. |
| `/sync-claude-config push\|pull` | Mirror `~/.claude/` ↔ `config-claude/`. |
| `/reset-claude-baseline` | Wipe configurable parts of `~/.claude/`, reinstall from the repo. Preserves credentials / sessions / history. |
| `/extend-claude-baseline` | Add an additive change to the baseline (permission, hook, MCP server, rule @-ref), then chain into `/ecosystem-sync`. |

All 4 are symlinked into `~/.claude/commands/` so they work as regular slash commands anywhere.

## Indexes

Two auto-generated catalogs at the root:

- **`INDEX.md`** — full catalog (all agents, commands, rules, skills). Used by `tool-finder`.
- **`INDEX-PROJECT.md`** — filtered subset: per-project skills only (universals are already active globally). Used by `tool-project`.

`eco/` tools are **intentionally excluded** from both.

Rebuild after any change:
```bash
/rebuild-ecosystem-index
```

## Config mirror

`config-claude/` keeps the 3 user-level config files under version control:
- `CLAUDE.md` — baseline doctrine loaded in every session
- `settings.json` — permissions, hooks, `effortLevel`, attribution
- `.mcp.json` — MCP servers

Sync flow:
- edited `~/.claude/` → `/sync-claude-config push` → commit the repo
- fresh machine → clone the repo → `/sync-claude-config pull` → restart Claude Code

---

## Current state

### Global activation (`~/.claude/` snapshot)

- **CLAUDE.md** — generic doctrine (language/framework-neutral) + `@-references` to the 6 rules
- **settings.json** — `effortLevel: high`, `attribution.commit: ""`, `attribution.pr: ""` (no Claude co-author), 52 permissions auto-accepted, 4 active hooks
- **`.mcp.json`** — Context7 only
- Symlinks: 13 agents, 14 commands, 20 skills

### Hooks (enforced by the harness)

| Hook | Behaviour |
|---|---|
| deny npm / yarn / pnpm / npx | Bun-first enforcement (replace with `bun` / `bunx`) |
| deny hook-bypass flags | blocks the two git flags that would skip local hooks / signatures |
| ask on destructive shell ops | `rm -rf`, `git reset --hard`, `git push --force` require confirmation |
| ask on git commit / push | manual approval for every commit and push (any branch) |

### Counts

- 13 agents · 10 commands · 6 rules · 44 skills
- 19 globally symlinked skills (universals) + 25 per-project (specialised)
- 4 eco commands + 1 eco skill (managing this repo)

---

## What is NOT built yet

- **Incremental rebuild in `scripts/build-index.py`** — the script accepts `--incremental` as a flag but currently falls back to a full rebuild. Fast enough for now (<1s) but noted for later if the ecosystem grows 10×.
- **Auto-trigger of `ecosystem-sync` on `git push`** — today the skill activates on the natural-language trigger ("push this repo"). A hook on `Bash(git push:*)` could invoke it deterministically; kept manual on purpose so the audit is visible to the user.
- **`tool-project` / `tool-finder` live testing** — both skills are fully documented but have not been exercised end-to-end inside a consumer repo yet. Next session: pick a real project, run `tool-project`, confirm behaviour.
- **Language-specific reviewer extensions** — currently `typescript-reviewer` and `cpp-reviewer` exist; `python-reviewer` does not. Add when the need arises.
- **MCP additions beyond Context7** — filesystem / git / github / exa / firecrawl could be useful globally but kept minimal for now. Extend per-project as needed.
- **Tests for `build-index.py`** — the script is short and battle-tested manually; no pytest suite yet.

---

## Next session checklist

When restarting Claude Code:

1. Hooks defined in `~/.claude/settings.json` load at session start — new session picks up the 4 hooks.
2. Symlinks in `~/.claude/{agents,commands,skills}/` are discovered at startup.
3. Memory files cached in the OLD session (`~/CLAUDE.md`, `~/.claude/rules/context7.md`) disappear — only `~/.claude/CLAUDE.md` remains.
4. Test: open a real project → ask Claude to set up tools → `tool-project` should activate.

---

## Other root files

- `CLAUDE.md` — loaded when Claude works IN this repo (different from `~/.claude/CLAUDE.md`, which is user-global).
- `config-claude/README.md` — config mirror workflow.
- `eco/README.md` — why `eco/` is separated and what lives there.
