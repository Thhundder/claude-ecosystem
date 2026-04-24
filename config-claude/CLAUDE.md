# Global Claude Doctrine

User-level config. Applied in every session, every project. Language/framework/domain-neutral — project-specific tooling is selected per-repo by the future `research` skill.

## Core Always / Never (short version)

**Always**
- Be surgical — change only what the task requires.
- Default to no comments. Only write a comment when the *why* is non-obvious.
- Plan before coding when touching ≥3 files or new architecture (`planner` agent, `/plan`).
- Search GitHub / Context7 / package registries before writing custom code.
- Delegate to specialized agents when one fits (planner, code-reviewer, security-reviewer, tdd-guide, etc.).
- Conventional commits. Messages explain *why*, not *what*.
- Validate inputs at system boundaries only. Trust internal contracts.

**Never**
- Include secrets in output / commits / logs.
- Use `--no-verify` / `--no-gpg-sign` (enforced by hook).
- Force-push to main/master or run destructive commands without explicit confirmation.
- Silently swallow errors (`catch {}`, bare `except`).
- Add backwards-compat shims unless explicitly asked.

## Inheritance from the ecosystem rules

The detailed universal doctrine lives in `~/Documents/claude-ecosystem/rules/`. Referenced here so they're always in context:

@~/Documents/claude-ecosystem/rules/core/must-always-must-never.md
@~/Documents/claude-ecosystem/rules/core/coding-style.md
@~/Documents/claude-ecosystem/rules/core/security.md
@~/Documents/claude-ecosystem/rules/workflow/development-workflow.md
@~/Documents/claude-ecosystem/rules/workflow/agent-orchestration.md
@~/Documents/claude-ecosystem/rules/quality/testing.md

## Ecosystem layout

- **Universal tools** (agents / commands / skills) are symlinked into `~/.claude/` from the ecosystem.
- **Specialized tools** (backend, frontend, domain-specific like RAG / voice, language-specific like Python / TS, Telnyx SDK, etc.) stay in the ecosystem and are installed per-project by the future `research` skill.
- This config is mirrored into `~/Documents/claude-ecosystem/config-claude/` for versioning. Run `/sync-claude-config` after any change to `~/.claude/` to persist the diff into the repo.
