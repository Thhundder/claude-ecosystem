# eco/ — Tools That Manage This Ecosystem

These are **meta-tools** — they exist to manage the `claude-ecosystem` repo itself (indexing, syncing, baseline reset, etc.). They are **intentionally excluded from `INDEX.md` and `INDEX-PROJECT.md`** so the main catalog stays focused on tools consumable by real projects.

## Current contents

### Commands (`eco/commands/`)

| Command | Role |
|---|---|
| `/rebuild-ecosystem-index` | Regenerate `INDEX.md` + `INDEX-PROJECT.md` by scanning frontmatters in `agents/`, `commands/`, `rules/`, `skills/`. |
| `/sync-claude-config` | Mirror `~/.claude/` ↔ `config-claude/` (push or pull the 3 versioned files). |
| `/reset-claude-baseline` | Wipe the configurable parts of `~/.claude/` and reinstall from `config-claude/` + global symlinks. Preserves credentials/sessions/history. |
| `/extend-claude-baseline` | Add a small additive change to the baseline (permission, hook, rule @-ref, MCP server) and chain into `/ecosystem-sync`. |

### Skills (`eco/skills/`)

| Skill | Role |
|---|---|
| `ecosystem-sync` | 3-phase pre-push audit: drift check `~/.claude/` vs `config-claude/`, smart INDEX refresh, commit/push summary with user approval. |

## Why separate?

- **Clean INDEX**: the main catalog is what `tool-project` and `tool-finder` consume — mixing ecosystem-management tools in would confuse those skills and add noise for the end user.
- **Clear mental model**: `eco/` = "tools about this repo"; everything else = "tools applicable to real projects".
- **Easy future extensions**: any new meta-tool for managing the ecosystem goes here.

## Symlinks in `~/.claude/`

The 4 eco commands + the ecosystem-sync skill are still symlinked into `~/.claude/commands/` and `~/.claude/skills/` so they're available as `/rebuild-ecosystem-index`, `/sync-claude-config`, `/reset-claude-baseline`, `/extend-claude-baseline`, and the ecosystem-sync skill triggers as expected. The exclusion is **only from the INDEX markdown files**, not from runtime availability.
