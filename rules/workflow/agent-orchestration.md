# Agent Orchestration

Use specialized agents proactively. Delegate instead of doing everything in the main thread.

## Default Agent Routing

No user prompt needed — invoke automatically when:

| Trigger | Agent |
|---------|-------|
| Complex feature request | `planner` (+ `architect` for system-level) |
| Just wrote or modified code | `code-reviewer` |
| New feature or bug fix | `tdd-guide` |
| Architectural decision | `architect` |
| Exploring an unfamiliar codebase | `code-explorer` |
| Touching auth / inputs / secrets / DB / external APIs | `security-reviewer` |
| Hot path / latency / DB query tuning | `performance-optimizer` |
| Refactoring for cleanup | `refactor-cleaner` |
| Something silently broke in production | `silent-failure-hunter` |
| PR review | `code-reviewer` + `security-reviewer` + language-specific reviewer in parallel |

## Language-Specific Reviewers

| Language | Reviewer |
|----------|----------|
| TypeScript / JavaScript | `typescript-reviewer` |
| C++ | `cpp-reviewer` |

## Parallel Execution

**Always run independent agents in parallel** using a single message with multiple Agent tool calls. Sequential execution is only acceptable when one agent's output is the next's input.

Good:
```
Launch 3 agents in parallel:
1. security-reviewer on auth/
2. performance-optimizer on db/queries.ts
3. typescript-reviewer on hooks/
```

Bad:
```
First run security-reviewer, wait, then performance-optimizer, wait...
```

## Multi-Perspective Analysis

For high-stakes output where you can't afford a single reviewer to miss something, use **`santa-method`**: two independent review agents must both pass before the output ships.

## Subagent Prompting

When delegating via the Agent tool:

- **Write self-contained prompts**. The subagent has no memory of this conversation. Restate context, paths, constraints.
- **Explicitly set scope**: "read-only investigation" vs. "implement the fix." Subagents default to helpful and will write code unless told not to.
- **Request structured output** if you're going to aggregate multiple subagent results.
- **Ask for brief reports** ("under 300 words") when the findings matter more than the raw output.
- **Don't delegate understanding**. Never write "based on your findings, fix the bug" — that pushes synthesis to the agent. Do the synthesis yourself and delegate concrete execution.

## When NOT to Use an Agent

- Single-file trivial edits (rename, add a test)
- Questions you can answer with a single tool call (Read, Grep, Glob)
- Anything where the user asked a direct yes/no question — answer them, don't delegate it

Agents have overhead. Use them when the task benefits from isolation, specialization, or parallelism.
