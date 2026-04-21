# Development Workflow

The standard flow for implementing any non-trivial feature, fix, or refactor.

## Phase 0 — Research & Reuse (mandatory)

Before writing any new implementation:

1. **Search GitHub first** via `gh search repos` and `gh search code`. Find existing implementations, templates, and patterns.
2. **Check primary library docs** via Context7 / documentation-lookup skill. Never code against training-data memory for APIs — it's likely stale.
3. **Check package registries** (npm, PyPI, etc.) for battle-tested libraries before writing utility code.
4. **Use Exa / deep-research** only when the first three are insufficient.
5. **Look for adaptable implementations** — open-source projects that solve ≥80% of the problem and can be forked, ported, or wrapped.

> Rule of thumb: prefer adopting or porting a proven approach over writing net-new code.

## Phase 1 — Plan First

- Use the **planner** agent for any feature that spans ≥3 files or introduces new architecture.
- Generate: requirements restatement, dependencies, risks, phased steps.
- **Wait for user confirmation** before touching code.
- For complex work, use `/plan` or `/multi-plan` slash commands.

## Phase 2 — TDD Implementation

For non-trivial features/fixes:

1. Write a failing test (RED).
2. Run it — confirm it fails for the right reason.
3. Write the minimal code to make it pass (GREEN).
4. Refactor with tests green (IMPROVE).
5. Verify coverage stays ≥80% for new code.

Use **tdd-guide** agent proactively when touching critical paths.

## Phase 3 — Code Review

Immediately after implementation:

- **code-reviewer** for general quality
- **security-reviewer** for any code touching auth, user input, secrets, external APIs, DB queries, or file system
- **typescript-reviewer** / **python-reviewer** for language-specific smells
- **performance-optimizer** when touching hot paths

Address CRITICAL and HIGH issues before continuing. MEDIUM when possible.

## Phase 4 — Pre-Commit Checks

- Run the project's lint/typecheck/test commands. Verify they pass locally.
- Resolve any merge conflicts.
- Ensure your branch is up to date with the target branch.
- Only then request review / open PR.

## Phase 5 — Commit & PR

- Conventional commits: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`, `perf:`, `ci:`.
- Commit messages explain **why**, not what.
- PR description includes: summary, test plan, screenshots if UI, and any risks.
- Never `--no-verify` unless explicitly requested by the user.
