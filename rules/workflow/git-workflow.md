# Git Workflow

## Commit Message Format

```
<type>: <description>

<optional body explaining why>
```

**Types**: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`, `ci`, `build`, `style`.

**Rules**:
- Subject under 72 chars, imperative mood ("add", not "added").
- Body explains **why**, not what. The diff shows what.
- One concern per commit. Split unrelated changes.
- No mention of task IDs, caller names, or temporary context that will rot.

## Safety Protocol

- **Never** run destructive git commands without explicit user confirmation:
  - `git reset --hard`
  - `git push --force` (especially to main/master)
  - `git clean -fd`
  - `git branch -D`
  - `git checkout .` / `git restore .`
- **Never** skip hooks (`--no-verify`, `--no-gpg-sign`) unless the user explicitly asks.
- **Never** update `.git/config` or identity settings.
- **Never** commit files that look like secrets: `.env*`, `credentials*`, `*key*`, `*token*`, `*.pem`.
- **Prefer new commits over amending** published commits.

## Staging

Prefer `git add <file>` over `git add -A` / `git add .` — avoids accidentally staging secrets or junk.

## Pull Request Workflow

Before opening a PR:

1. Run `git log main..HEAD` to see the **full commit history** of the branch.
2. Run `git diff main...HEAD` to see the **full diff** (triple-dot, not double).
3. Run lint + typecheck + tests locally. Fix anything failing.
4. Ensure the branch is up to date with the target branch (rebase or merge).
5. Draft a comprehensive PR description covering:
   - What changed and why (not for every file — high-level summary).
   - How it was tested (bullet list of the test plan).
   - Risks, rollback plan for anything non-trivial.
   - Screenshots for UI changes.

Use `gh pr create` with a heredoc for the body to preserve formatting.

## Branching

- Feature branches off `main` (or whatever the default is).
- Name them `feat/<short-kebab>`, `fix/<short-kebab>`, `chore/<short-kebab>`.
- Delete after merge.

## Reviewing PRs

- Pull the branch locally (`gh pr checkout <n>`) before reviewing substantive PRs.
- Read the full diff top to bottom, not just the files the author flagged.
- Comment on individual lines via `gh api repos/{owner}/{repo}/pulls/{n}/comments` for line-level feedback.
