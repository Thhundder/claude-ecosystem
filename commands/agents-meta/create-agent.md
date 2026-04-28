---
description: Create a new Claude Code sub-agent (markdown + frontmatter, scaffolded into the ecosystem repo, symlinked globally, indexed)
argument-hint: <one-line agent description, e.g. "audit React components for accessibility">
---

# Create Agent

Trigger the `agent-creator` skill in **create mode** to scaffold a new sub-agent from `$ARGUMENTS`.

**Input**: $ARGUMENTS

If `$ARGUMENTS` is empty, ask the user for:
- The agent's role (one sentence)
- Example user phrasing that should trigger it
- Read-only or writer
- Model preference (default: sonnet)
- Category folder

Otherwise, infer reasonable defaults from `$ARGUMENTS`, propose them back to the user for confirmation, then proceed:
1. Read `INDEX.md` to check for collision with existing agents
2. Scaffold `agents/<category>/<name>.md` with frontmatter + persona template
3. Symlink to `~/.claude/agents/<name>.md`
4. Run `python3 scripts/build-index.py` from the ecosystem root
5. Optionally smoke-test the new agent on a representative task

For tuning an existing agent (description rewrite, model change, tool adjustment), the user should describe what's wrong and the skill will route to **tune mode** automatically — no separate slash command needed.
