# Claude Code Config — Versioned Mirror

Mirror of the user-level Claude Code config (`~/.claude/`) versioned here so it can be checked into git and restored on another machine.

## Files

- `CLAUDE.md` — user-level doctrine loaded in every session
- `settings.json` — permissions, hooks, effortLevel
- `.mcp.json` — MCP server config (Context7 baseline)

## Sync workflow

### You edited `~/.claude/*` → persist to this repo

```
/sync-claude-config push
```

Copies from `~/.claude/` → `config-claude/`. Commit the repo manually after.

### You restored this repo on a new machine → apply to `~/.claude/`

```
/sync-claude-config pull
```

Copies from `config-claude/` → `~/.claude/`. **Does not** overwrite `.credentials.json`, session data, or history — only the config files listed above.

## Manual backup before big changes

The sync command does not back up. Do it yourself with e.g. `cp -r ~/.claude ~/.claude-backup-$(date +%F)` before pulling / experimenting.
