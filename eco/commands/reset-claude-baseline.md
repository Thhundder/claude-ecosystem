---
description: Wipe the configurable parts of ~/.claude/ (preserving credentials + sessions + history) and reinstall from config-claude/ + the global symlinks. Use when ~/.claude/ has drifted, become polluted, or on a fresh machine. Requires user confirmation before destructive actions.
argument-hint: (no args — interactive confirmation required)
---

# /reset-claude-baseline

Bring `~/.claude/` back to a **clean baseline** that matches this repo's `config-claude/` snapshot and the symlinked universal tools.

## What gets wiped

Only the *configurable* entries — things that can be regenerated from this repo:

- `~/.claude/CLAUDE.md` (restored from `config-claude/CLAUDE.md`)
- `~/.claude/settings.json` (restored from `config-claude/settings.json`)
- `~/.claude/.mcp.json` (restored from `config-claude/.mcp.json`)
- `~/.claude/agents/` (recreated as symlinks to `agents/*.md`)
- `~/.claude/commands/` (recreated as symlinks — non-eco + ecosystem-sync toolbelt)
- `~/.claude/skills/` (recreated as symlinks to universal skills only)
- `~/.claude/rules/` (deleted — rules are loaded via CLAUDE.md `@references`)
- Ephemeral dirs created by surveys: `plans/`, `tasks/`, `cache/`, `downloads/`, `paste-cache/`, `telemetry/`, `session-env/`, `backups/`

## What is PRESERVED (never touched)

- `.credentials.json` — Anthropic auth
- `projects/`, `sessions/`, `history.jsonl`, `file-history/`, `ide/`, `shell-snapshots/` — runtime state
- `settings.local.json` — machine-local overrides (kept as-is)

## Execution

### Step 1 — Confirm with the user

Before anything destructive, show a summary of what will be wiped and ask:

```
RESET CLAUDE BASELINE

About to wipe (recoverable from this repo):
  ~/.claude/CLAUDE.md
  ~/.claude/settings.json
  ~/.claude/.mcp.json
  ~/.claude/agents/        (and recreate symlinks)
  ~/.claude/commands/      (and recreate symlinks)
  ~/.claude/skills/        (and recreate universal symlinks only)
  ~/.claude/rules/         (deleted — @-referenced from CLAUDE.md instead)
  ~/.claude/plans|tasks|cache|downloads|paste-cache|telemetry|session-env|backups  (if present)

PRESERVED:
  .credentials.json, projects/, sessions/, history.jsonl, file-history/, ide/, shell-snapshots/, settings.local.json

Proceed? (yes/no)
```

Stop if user answers no.

### Step 2 — Backup (non-negotiable)

```bash
BACKUP=~/.claude-backup-$(date +%Y%m%d-%H%M%S)
mkdir -p "$BACKUP"
for f in CLAUDE.md settings.json settings.local.json .mcp.json mcp-needs-auth-cache.json; do
  [ -e ~/.claude/$f ] && cp ~/.claude/$f "$BACKUP/$f"
done
for d in agents commands skills rules plans tasks plugins; do
  [ -e ~/.claude/$d ] && cp -r ~/.claude/$d "$BACKUP/$d"
done
echo "Backup at $BACKUP"
```

### Step 3 — Wipe configurable entries

```bash
rm -rf ~/.claude/agents ~/.claude/commands ~/.claude/skills ~/.claude/rules
rm -rf ~/.claude/plans ~/.claude/tasks ~/.claude/cache ~/.claude/downloads
rm -rf ~/.claude/paste-cache ~/.claude/telemetry ~/.claude/session-env ~/.claude/backups
rm -f ~/.claude/CLAUDE.md ~/.claude/settings.json ~/.claude/.mcp.json ~/.claude/mcp-needs-auth-cache.json
```

### Step 4 — Reinstall from this repo

```bash
ECO=~/Documents/claude-ecosystem

# Config files from the snapshot
cp "$ECO/config-claude/CLAUDE.md" ~/.claude/CLAUDE.md
cp "$ECO/config-claude/settings.json" ~/.claude/settings.json
cp "$ECO/config-claude/.mcp.json" ~/.claude/.mcp.json

# Recreate symlinks for tool directories
mkdir -p ~/.claude/agents ~/.claude/commands ~/.claude/skills

# Agents — all of them are universal
for f in "$ECO/agents"/*/*.md; do
  ln -sf "$f" ~/.claude/agents/"$(basename "$f")"
done

# Commands — non-eco
for f in "$ECO/commands"/*/*.md; do
  ln -sf "$f" ~/.claude/commands/"$(basename "$f")"
done
# Commands — eco toolbelt (symlinked so they're accessible as /rebuild-ecosystem-index, etc.)
for f in "$ECO/eco/commands"/*.md; do
  ln -sf "$f" ~/.claude/commands/"$(basename "$f")"
done

# Skills — universal only (per the list below)
# Trimmed 2026-04-27 — rare skills moved to per-project (install via tool-project)
UNIVERSAL_SKILLS=(
  "agents-meta/blueprint"
  "agents-meta/prompt-optimizer"
  "agents-meta/tool-finder"
  "agents-meta/tool-project"
  "agents-meta/verification-loop"
  "agents-meta/workflow-apex"
  "analysis/documentation-lookup"
  "analysis/explore"
  "analysis/feature-digest"
  "context-cost/context-budget"
  "quality/code-review-standards"
  "quality/fix-errors"
  "testing/tdd-workflow"
  "testing/workflow-debug"
)
for s in "${UNIVERSAL_SKILLS[@]}"; do
  ln -sf "$ECO/skills/$s" ~/.claude/skills/"$(basename "$s")"
done

# Eco skills (the ones that manage this ecosystem itself)
for d in "$ECO/eco/skills"/*/; do
  ln -sf "${d%/}" ~/.claude/skills/"$(basename "${d%/}")"
done
```

### Step 5 — Report

```bash
echo "Reset complete."
echo "  agents: $(ls ~/.claude/agents/ | wc -l)"
echo "  commands: $(ls ~/.claude/commands/ | wc -l)"
echo "  skills: $(ls ~/.claude/skills/ | wc -l)"
echo "Backup kept at $BACKUP"
echo "Restart Claude Code (or open /hooks) so the new settings.json is loaded."
```

## Rules

- **Never run without user confirmation** (Step 1).
- **Always create a backup first** (Step 2).
- **Never touch** `.credentials.json`, `projects/`, `sessions/`, `history.jsonl`, `file-history/`, `ide/`, `shell-snapshots/`, `settings.local.json`.
- If the user has edits in `~/.claude/` that aren't in `config-claude/`, warn them first — they should run `/sync-claude-config push` before `/reset-claude-baseline`.
