# Model Selection & Cost Awareness

## Model Tiers

Anthropic currently ships three active tiers. Pick based on task depth, not habit.

### Haiku 4.5
Fastest and cheapest, ~90% of Sonnet's quality for many tasks, 3× cost savings.

**Use for**:
- Lightweight agents with frequent invocation (reviewers, linters, formatters)
- Simple code generation, boilerplate
- Worker agents in multi-agent systems (parallel subagents)
- Classification, extraction, summarization of short texts
- Tool-calling pipelines where the LLM mostly orchestrates

### Sonnet 4.6
Best general coding model. Default for day-to-day work.

**Use for**:
- Main development work — writing, refactoring, debugging
- Orchestrating multi-agent workflows
- Complex coding tasks across multiple files
- Most subagents for reviewers and planners (unless you need deeper reasoning)

### Opus 4.6
Deepest reasoning, most expensive.

**Use for**:
- Complex architectural decisions with real tradeoffs
- `planner` and `architect` agents on non-trivial features
- Research, deep analysis, code audits of unfamiliar systems
- Anything that requires holding a lot of context and reasoning about it

## Routing Rules

- Default to **Sonnet** unless you have a reason to switch.
- Upgrade to **Opus** when: you're in `plan` mode, working on architecture, reviewing security-critical code, or the task spans 10+ files.
- Downgrade to **Haiku** when: running a fleet of parallel subagents, doing mechanical transformations, or running a skill whose body already encodes most of the logic.

Use the `/model-route` command to make the routing explicit when you're unsure.

## Context Window Management

- **Avoid the last 20% of the context window** for any task that requires holding state: large refactors, multi-file features, deep debugging.
- In the last 20%, restrict yourself to: single-file edits, independent utility creation, documentation updates, simple bug fixes.
- Use `/context-budget` or the `context-budget` skill to audit where context is going — skills, agents, MCPs, rules, conversation.
- Use `strategic-compact` skill to compact at **logical task boundaries**, not when the auto-compact triggers.

## Extended Thinking

- Extended thinking is on by default, budget up to ~32k tokens for internal reasoning.
- Keep it on for: architecture, debugging, security review, algorithm design.
- Disable for: trivial tasks, quick status queries, mechanical edits (saves latency).

## Cost Signals to Watch

For voice AI and LLM-product work specifically (relevant to Xeko):

- **Streaming voice costs scale with duration** — cap max session length.
- **OpenAI Realtime API is expensive** compared to text completions. Use it only on live voice; batch other reasoning with cheaper text models.
- **Context caching** (prompt caching) saves ~90% on repeated system prompts. Always enable for stable prompts.
- **Embeddings** are cheap but rate-limited — batch them.
- **Retry budgets** — cap retries per request. Exponential backoff with a hard ceiling.

Use the `cost-aware-llm-pipeline` skill when building or refactoring any LLM pipeline.
