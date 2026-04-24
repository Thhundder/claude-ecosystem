---
name: fix-errors
description: "Use when a JS/TS project has ESLint and/or TypeScript errors to clear — groups errors into areas of max 5 files, dispatches parallel sub-agents to fix each area, then re-verifies. TRIGGER: lint errors, tsc errors, /fix-errors command, pre-commit cleanup of a noisy codebase, large red diagnostic count in the IDE, migration leftovers. SKIP: Python/Ruby/Go codebases (not lint+tsc scope), one or two errors (fix inline), failing tests (use workflow-debug), build/runtime errors unrelated to lint/type."
allowed-tools: Bash(bun :*), Bash(bunx :*), Bash(pnpm :*), Bash(npm :*), Bash(tsc :*), Read, Task, Grep
origin: user-integration
---

# Fix Errors

Fix all ESLint and TypeScript errors by breaking them into areas and processing in parallel.

## Workflow

1. **DISCOVER COMMANDS**: Check `package.json` for exact script names
   - Look for: `lint`, `typecheck`, `type-check`, `tsc`, `eslint`, `prettier`, `format`

2. **RUN DIAGNOSTICS**:
   - Run `bun run lint` (or `pnpm run lint` / `npm run lint` depending on project — detect from lockfile)
   - Run `bun run typecheck` or `tsc --noEmit`
   - Capture all error output

3. **ANALYZE ERRORS**:
   - Extract file paths from error messages
   - Group errors by file location
   - Count total errors and affected files

4. **CREATE ERROR AREAS**:
   - **MAX 5 FILES PER AREA**
   - Group related files together (same directory/feature)
   - Example: `Area 1: [file1, file2, file3, file4, file5]`

5. **PARALLEL PROCESSING**: Launch snipper agents for each area
   - Use Task tool with multiple agents simultaneously
   - Each agent processes one area (max 5 files)
   - Provide specific error details for each file

6. **VERIFICATION**: Re-run diagnostics after fixes
   - Wait for all agents to complete
   - Re-run lint and typecheck
   - Report remaining errors

7. **FORMAT CODE**: Apply Prettier / Biome (if available)
   - Run `bun run format` or equivalent depending on project tooling

## Snipper Agent Instructions

```
Fix all ESLint and TypeScript errors in these files:
[list of files with their specific errors]

Focus only on these files. Make minimal changes to fix errors while preserving functionality.
```

## Rules

- ALWAYS check package.json first for correct commands
- ONLY fix linting and TypeScript errors
- NO feature additions - minimal fixes only
- PARALLEL ONLY - use Task tool for concurrent processing
- Every error must be assigned to an area

User: $ARGUMENTS
