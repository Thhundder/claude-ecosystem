# Coding Style

## Core Principles

### KISS — Keep It Simple
- Prefer the simplest solution that actually works.
- Avoid premature optimization.
- Optimize for clarity over cleverness.

### DRY — Don't Repeat Yourself (but not prematurely)
- Extract repeated logic when repetition is real, not speculative.
- Three similar lines is better than a premature abstraction.
- Avoid copy-paste drift between near-identical implementations.

### YAGNI — You Aren't Gonna Need It
- Don't build features or abstractions before they are needed.
- Don't add error handling, fallbacks, or validation for scenarios that can't happen.
- Start simple. Refactor when real pressure justifies it.

### Immutability
- Create new objects; never mutate existing ones passed in as arguments.
- Prevents hidden side effects and simplifies debugging.

## File Organization

- Many small focused files beat few large ones.
- Typical file: 200–400 lines. Hard ceiling: 800 lines.
- Organize by feature/domain, not by type (avoid `utils/`, `helpers/`, `common/` dumping grounds).

## Naming

- Variables / functions: `camelCase` (JS/TS), `snake_case` (Python), descriptive.
- Booleans: prefix with `is`, `has`, `should`, `can`.
- Types / interfaces / components: `PascalCase`.
- Constants: `UPPER_SNAKE_CASE`.
- Custom hooks: `useSomething`.

## Code Smells to Eliminate

- **Deep nesting** (>4 levels) — use early returns.
- **Magic numbers** — extract to named constants.
- **Long functions** (>50 lines) — split by responsibility.
- **Mutation of arguments** — return new values.
- **Silent error swallowing** — log or propagate.

## Comments Policy

- Default: write no comments. Well-named code is self-documenting.
- Only add a comment when the *why* is non-obvious: a hidden constraint, a subtle invariant, a workaround for a specific bug, or behavior that would surprise a reader.
- Never explain *what* the code does — identifiers already do that.
- Never reference the current task, fix number, or caller ("used by X", "added for Y flow"). That rots.

## Error Handling

- Handle errors explicitly at every level. Never `catch` into nothing.
- Provide actionable user-facing messages in UI code.
- Log detailed error context on the server side with structured logging.
- Fail fast at boundaries with clear errors.

## Quality Checklist (before marking work complete)

- [ ] Code is readable and well-named
- [ ] Functions are small (<50 lines)
- [ ] Files are focused (<800 lines)
- [ ] No deep nesting (>4 levels)
- [ ] Proper error handling
- [ ] No hardcoded values — use constants or config
- [ ] Immutable patterns where practical
- [ ] Tests cover new behavior
