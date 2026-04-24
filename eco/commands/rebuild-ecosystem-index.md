---
description: Regenerate the ecosystem INDEX.md by scanning all agents/commands/rules/skills frontmatters. Run after adding, removing, or modifying any artefact in the ecosystem.
allowed-tools: Bash(python3 :*), Read
---

# /rebuild-ecosystem-index

Regenerate `INDEX.md` at the root of the ecosystem. The index is the source-of-truth catalog consumed by the `tool-project` and `tool-finder` skills — keeping it fresh avoids each skill having to re-scan the whole repo.

## What it does

1. Runs `python3 scripts/build-index.py` from the ecosystem root.
2. The script walks `agents/`, `commands/`, `rules/`, `skills/`, extracts YAML frontmatters, and writes `INDEX.md`.
3. For each skill, marks scope as `global` (symlinked in `~/.claude/skills/`) or `per-project`.
4. Extracts `TRIGGER:` / `SKIP:` from skill descriptions when present.
5. Prints a count of entries.

## When to run

- Added/removed/modified an agent, command, rule, or skill
- Before pushing the repo (the future `ecosystem-sync` skill will do this automatically)
- When the index looks stale or incorrect

## Usage

```
/rebuild-ecosystem-index
```

No arguments. Takes less than a second.

## Execution

```bash
cd ~/Documents/claude-ecosystem && python3 scripts/build-index.py
```

After running, review the diff in `INDEX.md`:

```bash
git diff INDEX.md
```

If the diff looks right, include it in your next commit.
