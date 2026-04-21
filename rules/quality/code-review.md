# Code Review Standards

## When to Review (mandatory triggers)

- Immediately after writing or modifying code
- Before any commit to a shared branch
- When security-sensitive code is touched (auth, payments, user data, secrets)
- When architectural changes are made
- Before merging a PR

## Pre-Review Requirements

Before requesting review, ensure:

- All automated checks (lint, typecheck, tests, CI) pass locally
- Merge conflicts are resolved
- Branch is up to date with the target branch

## Review Severity Levels

| Level | Meaning | Action |
|-------|---------|--------|
| **CRITICAL** | Security vulnerability or data loss risk | **BLOCK** — must fix before merge |
| **HIGH** | Bug or significant quality issue | **WARN** — should fix before merge |
| **MEDIUM** | Maintainability concern | **INFO** — consider fixing |
| **LOW** | Style or minor suggestion | **NOTE** — optional |

## Agent Routing

| Agent | Use For |
|-------|---------|
| `code-reviewer` | General quality, patterns, best practices |
| `security-reviewer` | OWASP Top 10, secret exposure, input validation |
| `typescript-reviewer` | TS/JS specific smells and idioms |
| `python-reviewer` | Python specific smells and idioms (add if missing) |
| `performance-optimizer` | Hot paths, N+1 queries, latency-sensitive code |
| `silent-failure-hunter` | Code that catches errors silently or has hidden failure modes |

## Common Issues to Catch

### Security
- Hardcoded credentials (API keys, passwords, tokens)
- SQL/NoSQL injection from string concatenation
- XSS via unescaped user content
- Path traversal from unsanitized file paths
- Missing auth / authz on protected routes
- Secrets logged to console or telemetry

### Code Quality
- Functions >50 lines — split by responsibility
- Files >800 lines — extract modules
- Deep nesting (>4 levels) — use early returns
- Missing error handling — handle explicitly
- Mutating arguments — return new values
- Missing tests for new behavior

### Performance
- N+1 queries — use joins, batching, or dataloaders
- Missing pagination — add LIMIT/OFFSET or cursor-based pagination
- Unbounded queries — constrain result sets
- Missing caching on expensive deterministic operations
- Synchronous I/O in async contexts

### LLM / Voice AI specific
- No cost budget / no max-tokens on LLM calls
- No retry with backoff on provider failures
- No timeout on voice media streams
- No circuit breaker on upstream voice provider
- Prompt injection surface not considered

## Approval Criteria

- **Approve**: no CRITICAL, no HIGH
- **Warn**: only HIGH (merge with caution)
- **Block**: any CRITICAL

## Review Workflow (parallel when possible)

```
1. git diff the changes
2. Run parallel agents:
   - security-reviewer
   - code-reviewer
   - language-specific reviewer
3. Run the project's test suite
4. Verify coverage didn't drop
5. Address findings by severity
```
