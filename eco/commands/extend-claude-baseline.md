---
description: Add something to the baseline Claude config (a new rule reference in CLAUDE.md, a new permission / hook in settings.json, or a new MCP server in .mcp.json) and chain into /ecosystem-sync to persist the change into this repo. Interactive — asks the user what to add.
argument-hint: [optional quick description of what to add]
---

# /extend-claude-baseline

Add a small additive change to `~/.claude/` (never a rewrite — use `/reset-claude-baseline` for that) and immediately chain into the ecosystem-sync workflow so the change lands in `config-claude/` and is ready to be pushed.

## Typical use cases

- Add a new permission to `settings.json` (e.g. allow `Bash(docker:*)`)
- Add a new hook to `settings.json`
- Add a new `@-reference` in `CLAUDE.md` to a new rule you just created in `rules/`
- Add a new MCP server to `.mcp.json`
- Tweak `effortLevel` or `attribution`

Use it when the change is **additive and small** — 1 block, 1 key, 1 line. For larger config rewrites, edit the live files and run `/ecosystem-sync` directly.

## Workflow

### Step 1 — Clarify the change

If `$ARGUMENTS` is present, treat it as the summary. Otherwise ask the user:

```
EXTEND BASELINE — what to add?
  1. permission (allow/deny/ask)
  2. hook (PreToolUse / PostToolUse / Stop / etc.)
  3. rule @-reference in CLAUDE.md
  4. MCP server
  5. other (free-form edit to one of the 3 files)
```

### Step 2 — Locate target file and previous state

Identify the target:
- permissions / hooks / effortLevel / attribution → `~/.claude/settings.json`
- rule @-references / doctrine additions → `~/.claude/CLAUDE.md`
- MCP server → `~/.claude/.mcp.json`

**Read the current file** before editing. Never write blindly.

### Step 3 — Propose the edit diff

Show the user the *exact* diff you would apply:

```
Target: ~/.claude/settings.json
Diff:
  permissions.allow: add "Bash(docker:*)"
```

Wait for user approval.

### Step 4 — Apply the edit

Use the `update-config` skill for `settings.json` edits (its merge logic preserves existing keys/arrays). For `CLAUDE.md`, use `Edit` to append an `@reference` at the right section. For `.mcp.json`, merge into the `mcpServers` object.

### Step 5 — Chain into `ecosystem-sync`

After the edit lands in `~/.claude/`, hand off:

> "Extension applied. Running `ecosystem-sync` to persist into the repo."

Then invoke the `ecosystem-sync` skill (or remind the user to run `/ecosystem-sync` if skill invocation isn't automatic). `ecosystem-sync` will:

1. Phase 1 — detect drift between `~/.claude/` and `config-claude/` (your new edit will show up)
2. Phase 2 — rebuild INDEX.md if any artefact files changed (usually not on a pure config edit)
3. Phase 3 — summarise, propose a commit message, wait for user approval

## Rules

- **Never delete or rewrite existing keys** in the target file — this command is additive only.
- **Always show the diff** before writing.
- **Always chain into `ecosystem-sync`** at the end so the live edit lands in the repo without a forgotten step.
- **Never invoke `/sync-claude-config push` directly** inside this command — let `ecosystem-sync` orchestrate that (it does the drift audit first).
- If the user's request is non-additive (remove something, rewrite a block), stop and say *"use `/reset-claude-baseline` or edit `~/.claude/<file>` manually instead"*.
