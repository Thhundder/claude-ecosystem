---
name: agent-creator
description: "Use to create a new Claude Code sub-agent (markdown file with YAML frontmatter — name/description/model/tools/persona) or to tune an existing one (rewrite description for better triggering, change model, change tool allow-list, sharpen persona). Scaffolds the agent file, places it in the ecosystem repo at agents/<category>/, symlinks it globally to ~/.claude/agents/ so it's available in every project, and rebuilds INDEX.md. TRIGGER: 'crée un agent', 'create an agent', 'new sub-agent', 'I want an agent that', 'je veux un agent', '/create-agent', 'agent-creator', 'tune an agent', 'rewrite the agent's description', 'change agent model', 'agent doesn't trigger'. Make sure to use this skill whenever the user wants to author or modify a sub-agent — even if they don't say 'agent-creator'. SKIP: creating a *skill* (use skill-creator), creating a *slash command* (just write a markdown file in commands/), tuning agent-harness internals like tool schemas / observation payloads / context budget engineering (use agent-harness-construction skill — that's a different layer), debugging why an existing agent gives bad output (use code review on the agent's prompt directly)."
origin: ECC
---

# Agent Creator

Author and tune Claude Code sub-agents — the markdown-with-frontmatter files that live in `agents/` and get auto-invoked based on their `description` field.

This skill operates in two modes:

- **Create** — scaffold a new agent from a short brief
- **Tune** — improve an existing agent (description trigger, model, tools, persona)

It always lands the artefact in the user's ecosystem repo (`~/Documents/claude-ecosystem/agents/<category>/<name>.md`), symlinks it globally to `~/.claude/agents/`, and rebuilds `INDEX.md`. The result is immediately available in every project.

## When to use

- The user wants a sub-agent for a focused task that benefits from isolation, parallelism, or a specialized prompt+tools combo (e.g. a custom reviewer for a domain, a domain-specific debugger, a third-party API auditor).
- The user has an existing agent that doesn't trigger reliably or whose output is misshapen — and they want to fix the agent definition, not the agent's runtime behavior.

## When NOT to use

- Creating a **skill** → use `skill-creator`. Skills are workflow guidance loaded into the main thread; agents are sub-processes with their own tools.
- Creating a **slash command** → just write a markdown file in `commands/<category>/`.
- Tuning **agent harness internals** (tool schemas, observation payloads, context-budget engineering) → use `agent-harness-construction` skill. That's a much deeper layer.
- Debugging why an agent gives bad answers on real input → review the agent's prompt manually with `code-reviewer`. This skill is for *creating/modifying* the definition, not diagnosing run-time behavior.

---

## Mode 1 — Create

### Phase 0 — Capture intent (interview, ≤2 min)

Ask the user, concisely:

1. **Role** — one sentence: *"What does this agent do?"* (e.g. "audit React components for accessibility issues")
2. **Trigger** — one or two example user phrases that should make Claude auto-invoke this agent (e.g. *"a11y audit this component"*, *"check WCAG compliance"*).
3. **Tools** — pick one of:
   - **Read-only auditor** (default for most reviewers) → `Read, Grep, Glob, Bash`
   - **Writer** (can edit code) → `Read, Write, Edit, Bash, Grep, Glob`
   - **Specialized** — user names specific tools
4. **Model** — pick one of:
   - **`opus`** — heavy reasoning (architecture, ADR, complex review). Expensive, slow.
   - **`sonnet`** — default. Strong reasoning, balanced cost.
   - **`haiku`** — fast, cheap. Good for parallel sub-agents on mechanical tasks.
5. **Category** — where in `agents/<category>/` to place it. Existing categories: `analysis`, `architecture`, `review`. Suggest the closest fit; create a new category folder only if none fits and the user confirms.

If the user gives a one-liner like *"crée un agent qui audite la sécurité Telnyx"*, infer reasonable defaults and **state them back** before scaffolding. Don't ask a 5-question interview if you can propose sensible defaults — just confirm.

### Phase 1 — Check for collisions (read INDEX.md)

```bash
cat ~/Documents/claude-ecosystem/INDEX.md | grep -A2 "## Agents"
```

If an existing agent already covers ≥70% of the proposed scope, **stop and tell the user** before creating a duplicate. Offer:
- Tune the existing one (Mode 2 below) instead
- Narrow the new agent's scope so it complements rather than competes
- Proceed anyway (user override)

### Phase 2 — Write the agent file

Create `~/Documents/claude-ecosystem/agents/<category>/<name>.md` with this exact structure:

```markdown
---
name: <kebab-case-name>
description: <see "Description rules" below>
tools: ["Read", "Grep", "Glob", "Bash"]
model: sonnet
---

You are a <role description in second person — "You are a senior frontend reviewer ensuring..."> .

## When invoked

1. **Gather context** — what to read first, what `git` commands to run, what scope to establish.
2. **Apply checklist** — the agent's specific review/analysis dimensions, ordered most-to-least important.
3. **Report findings** — explicit output format (sections, severity tags, file:line refs, remediation suggestions).

## Confidence filtering

Spell out when the agent should *report* vs *skip* a finding. This prevents noise. Default rules of thumb:
- Report if >80% confident it's a real issue
- Skip stylistic preferences unless they violate documented project conventions
- Consolidate similar issues into one finding ("5 missing await" not 5 separate)

## Output format

```
## Findings — <agent name>

### CRITICAL
- <file>:<line> — <issue> — <fix>

### HIGH
...

### MEDIUM
...
```

## Out of scope

Explicit list of what this agent must NOT do (so it doesn't drift into other agents' lanes).
```

### Description rules (the single most important field)

The `description` is the *only* signal Claude uses to decide whether to invoke the agent automatically. Get it right or the agent never triggers.

A good description has three parts:

1. **What it does** — one sentence with a strong verb.
   > "Expert React accessibility reviewer specializing in WCAG 2.2, ARIA, semantic HTML, and keyboard navigation."
2. **When to invoke** — concrete triggers + situations.
   > "Use immediately after writing or modifying any React component, MDX file, or storybook story."
3. **Mandate** — push-language to fight under-triggering.
   > "MUST BE USED for any change touching UI components."

Combine: *"Expert React accessibility reviewer ... Use immediately after ... MUST BE USED for any change touching UI components."*

**Anti-patterns** to avoid:
- Vague: *"Reviews code for issues."* → never triggers reliably.
- Too narrow: *"Reviews button.tsx."* → trivially scoped.
- Mandate without context: *"MUST BE USED."* → for what?
- Missing trigger phrases: no concrete user-prompt shape Claude can match against.

### Tool selection rules

- **Read-only auditor** (most reviewers): `Read, Grep, Glob, Bash`. Bash is for running tests / `git diff` / project tooling — not for editing.
- **Writer** (refactor, fix, generate): adds `Edit, Write`. Only when the agent must produce diffs autonomously. Strongly prefer read-only by default — it lets the user review the agent's report before deciding to apply changes.
- **Network-touching** (rare): adds `WebFetch`. Justify the need (most agents shouldn't browse).
- **Spawn other agents** (orchestrator): adds `Agent`. Almost never needed for sub-agents — orchestration belongs in skills, not agents.

### Model selection rules

- **`opus`** for: `architect`, `planner`, `security-reviewer` on critical paths, `prompt-optimizer`. Anywhere a single bad inference costs a lot.
- **`sonnet`** is the default. 90% of agents.
- **`haiku`** for: parallel fan-out (e.g. running 8 reviewers concurrently across modules), mechanical transformations, pre-screening before a heavier model.

### Phase 3 — Install + register

```bash
ln -sf ~/Documents/claude-ecosystem/agents/<category>/<name>.md \
       ~/.claude/agents/<name>.md

cd ~/Documents/claude-ecosystem && python3 scripts/build-index.py
```

Verify the agent appears in `INDEX.md` under `## Agents`.

### Phase 4 — Smoke test (optional, recommended)

If the user agrees, immediately invoke the new agent on a realistic task to validate triggering and output quality. Adjust the description if the agent fails to trigger; adjust the persona/checklist if the output shape is wrong.

---

## Mode 2 — Tune

### Phase 0 — Identify the symptom

Ask: *"What's wrong with the existing agent — does it not trigger, or does it trigger but produce bad output?"*

- **Doesn't trigger** → the `description` field is the problem. Go to Phase 1A.
- **Triggers but output is wrong/noisy/incomplete** → the persona/checklist is the problem. Go to Phase 1B.
- **Wrong tools** (can't read X, can't edit Y) → the `tools` array. Go to Phase 1C.
- **Too slow / too expensive** → the `model` field. Go to Phase 1D.

### Phase 1A — Rewrite the description

Read the current description. Apply the description rules from Mode 1. Specifically:
- Add concrete trigger phrases (the user's actual phrasing).
- Strengthen the mandate ("MUST BE USED for X" / "Use PROACTIVELY when Y").
- Remove vague filler ("reviews code for issues" → "reviews React components for WCAG 2.2 violations").

Keep the change minimal — surgical edits to the description, not a full rewrite of the agent. Show before/after to the user.

### Phase 1B — Sharpen the persona/checklist

Identify the specific output failure (noise? missed category? wrong format?). Then:
- Add explicit checklist items for missed categories.
- Tighten confidence filtering (e.g. raise the threshold to ">85% confident").
- Lock down the output format (literal template, not "use markdown headers").

### Phase 1C — Adjust tools

If the agent failed because it couldn't access a tool, add the minimum tool needed. Don't over-grant.

If the agent over-edited (caused damage), remove `Edit/Write` and have it report only.

### Phase 1D — Switch model

- Bumping to `opus` → only if the agent makes systematic reasoning errors that a stronger model would catch. Note the cost increase to the user.
- Dropping to `haiku` → only if the agent is doing mechanical work and you've verified the output quality holds. Test on 3+ real tasks before committing.

### Phase 2 — Apply + rebuild

Edit the file in `~/Documents/claude-ecosystem/agents/<category>/<name>.md` (the symlink at `~/.claude/agents/<name>.md` points back to it, so one edit propagates everywhere).

```bash
cd ~/Documents/claude-ecosystem && python3 scripts/build-index.py
```

### Phase 3 — Verify the fix

For description tuning: try the original failing prompt and confirm the agent now triggers.
For persona tuning: re-run on a realistic task and confirm the output format/content is fixed.
For tool/model changes: confirm the agent completes a representative task.

---

## Output artefacts

Each invocation produces:

- **Create mode**: `agents/<category>/<name>.md` (new) + symlink in `~/.claude/agents/` + INDEX.md updated.
- **Tune mode**: edits to existing `agents/<category>/<name>.md` + INDEX.md updated. Plus a one-paragraph diff summary shown to the user.

If the user has a `<project>/.claude/RESEARCH.md`, append a short note about the agent change so the project history stays complete.

---

## Common pitfalls this skill prevents

1. **Description that never triggers.** Mode 1 Phase 2's three-part rule + Mode 2 Phase 1A.
2. **Tool over-grant.** Default = read-only. Writers require explicit justification.
3. **Duplicate agents.** Mode 1 Phase 1 collision check.
4. **Forgetting to rebuild INDEX.md.** Built into both modes.
5. **Model misallocation** (using `opus` for fan-out, using `haiku` for nuanced reasoning). Phase 0 Q4 rules.
6. **Persona that grows over time** (every bug fix adds a paragraph). Tune mode tells you to keep edits minimal and surgical.

---

## Related tools

- `skill-creator` — creates skills (workflow guidance), not sub-agents. Use that for orchestration recipes.
- `agent-harness-construction` skill — for tuning the *technical* harness layer (tool schemas, observation payloads, recovery loops). Different concern.
- `harness-optimizer` agent — read-only audit of an existing harness configuration.
- `/create-agent` — slash wrapper for this skill (Mode 1 only).
- `/rebuild-ecosystem-index` — manual index rebuild (this skill calls it automatically).
