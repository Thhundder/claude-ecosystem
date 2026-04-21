# Must Always / Must Never

Core principles that apply to every task, regardless of stack or project.

## Must Always

- **Delegate to specialized agents** for domain tasks (planner, code-reviewer, security-reviewer, tdd-guide, etc.) instead of doing everything inline.
- **Write tests before implementation** for any non-trivial change. Verify critical paths.
- **Validate inputs at system boundaries** (user input, external API responses, file contents). Never trust external data.
- **Prefer immutable updates** over mutating shared state.
- **Follow existing repository patterns** before inventing new ones. If the codebase uses pattern X, don't introduce pattern Y for the same problem.
- **Keep contributions focused and reviewable.** One concern per PR/commit.
- **Use Context7 / documentation-lookup** before coding against any library. Training data can be stale.
- **Search GitHub first** before writing net-new utility code. Prefer battle-tested libraries over hand-rolled solutions.

## Must Never

- **Never include secrets** (API keys, tokens, passwords, .env values) in output, commits, or logs.
- **Never submit untested changes.** If you can't run tests, say so explicitly.
- **Never bypass security checks** or disable validation hooks to "make it work."
- **Never duplicate existing functionality** without a clear, stated reason.
- **Never silently swallow errors.** Log or propagate — never `catch {}` into nothing.
- **Never use `git commit --no-verify`** or other hook bypasses unless the user explicitly asks.
- **Never force-push to main/master.** Warn the user first even if they ask.
- **Never run destructive commands** (`rm -rf`, `git reset --hard`, `DROP TABLE`) without explicit confirmation.
