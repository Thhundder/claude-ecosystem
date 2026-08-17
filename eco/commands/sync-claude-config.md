---
description: Mirror user-level Claude config (~/.claude/) to or from this repo's config-claude/ snapshot. Usage — /sync-claude-config push (repo ← live) or /sync-claude-config pull (live ← repo).
argument-hint: push | pull
---

# /sync-claude-config

Sync the user-level Claude Code config between the live location (`~/.claude/`) and this repo's snapshot (`~/Documents/claude-ecosystem/config-claude/`).

## What it syncs

- `CLAUDE.md`
- `settings.json`
- `.mcp.json`
- `hooks/` — the scripts `settings.json` invokes by path

## What it does NOT touch

- `.credentials.json` — Anthropic auth
- `projects/`, `sessions/`, `history.jsonl`, `file-history/`, `ide/`, `shell-snapshots/` — runtime state
- `settings.local.json` — per-user local overrides (keep it machine-specific)

## Usage

```
/sync-claude-config push      # ~/.claude/ → config-claude/  (you edited the live config, persist it)
/sync-claude-config pull      # config-claude/ → ~/.claude/  (restore from repo on a fresh machine)
```

## Execution (run the Bash block below, honor $ARGUMENTS)

```bash
MODE="$ARGUMENTS"
LIVE=~/.claude
REPO=~/Documents/claude-ecosystem/config-claude
FILES=(CLAUDE.md settings.json .mcp.json)

case "$MODE" in
  push)
    echo "Pushing live → repo"
    for f in "${FILES[@]}"; do
      if [ -f "$LIVE/$f" ]; then
        cp "$LIVE/$f" "$REPO/$f" && echo "  ✓ $f"
      else
        echo "  ✗ $f missing in $LIVE"
      fi
    done
    if [ -d "$LIVE/hooks" ]; then
      mkdir -p "$REPO/hooks" && cp "$LIVE/hooks/"* "$REPO/hooks/" && echo "  ✓ hooks/"
    else
      echo "  ✗ hooks/ missing in $LIVE"
    fi
    echo
    echo "Done. Review the diff in $REPO and commit manually."
    ;;
  pull)
    echo "Pulling repo → live"
    for f in "${FILES[@]}"; do
      if [ -f "$REPO/$f" ]; then
        cp "$REPO/$f" "$LIVE/$f" && echo "  ✓ $f"
      else
        echo "  ✗ $f missing in $REPO"
      fi
    done
    if [ -d "$REPO/hooks" ]; then
      mkdir -p "$LIVE/hooks" && cp "$REPO/hooks/"* "$LIVE/hooks/" && chmod +x "$LIVE/hooks/"*.sh && echo "  ✓ hooks/"
    else
      echo "  ✗ hooks/ missing in $REPO"
    fi
    echo
    echo "Done. Reload hooks if needed (open /hooks or restart the session)."
    ;;
  *)
    echo "Usage: /sync-claude-config [push|pull]"
    echo "  push: ~/.claude/ → config-claude/ (persist live edits into the repo)"
    echo "  pull: config-claude/ → ~/.claude/ (restore from repo on a new machine)"
    exit 1
    ;;
esac
```

## Notes

- The command does NOT commit the diff after `push`. Run `git status` / `git commit` manually in the ecosystem repo.
- Symlinks in `~/.claude/agents/`, `/skills/`, `/commands/` point into the ecosystem so they're already versioned — they don't need syncing.
- To back up before a risky pull: `cp -r ~/.claude ~/.claude-backup-$(date +%F)`.
