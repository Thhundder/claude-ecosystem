---
name: tool-finder
description: "Use when the user describes a specific need or feature in natural language and wants to know if the ecosystem already has a matching tool, or if a new one should be created. Reads INDEX.md, scores candidates by semantic match, and returns top 3 with a verdict per candidate: already-active, install-per-project, create-new, or no-match. TRIGGER: 'I need a tool for X', 'is there a skill for Y', 'find me something that does Z', 'do I have a tool for …', 'should I create a skill for …', '/tool-finder', 'match my need'. SKIP: full project bootstrap (use tool-project), managing the ecosystem repo itself (use ecosystem-sync), direct slash-command execution, research across the web (use deep-research)."
origin: ECC
---

# Tool Finder

Feature-level tool lookup. Given a user's description of something they need, find the best-matching tool in the ecosystem and decide: **install it**, **tell them it's already active**, **propose to create a new skill**, or **acknowledge no match**.

Paired with `tool-project` (which bootstraps a whole repo). Use `tool-finder` when the need is **specific and isolated** — "I need to handle retry-with-backoff on my LLM client", "is there something for a11y audits?", "do I have a tool for zero-downtime migrations?".

## Activation check

Works in any directory (project or not). Detect context:

```bash
CWD=$(pwd)
IN_PROJECT=$(git rev-parse --show-toplevel 2>/dev/null || echo "")
IN_ECOSYSTEM=$([ "$IN_PROJECT" = "$HOME/Documents/claude-ecosystem" ] && echo "yes" || echo "no")
```

Context matters for Phase 4 (install options):
- **In a consumer project**: install options = per-project symlink
- **In the ecosystem repo**: install options = "add to global" (rare), or "just create if needed"
- **Outside any project**: can only inform, not install

---

## Phase 1 — Parse the user's need

Normalise the input into a set of **intent keywords + domain hints**.

User input examples:
- *"retry with backoff on LLM calls"* → keywords: `retry`, `backoff`, `LLM`, `API`, `cost`
- *"a11y audit my React component"* → keywords: `accessibility`, `WCAG`, `ARIA`, `React`, `audit`
- *"zero-downtime DB migration"* → keywords: `migration`, `zero-downtime`, `DB`, `schema`
- *"run tests in parallel for my monorepo"* → keywords: `tests`, `parallel`, `monorepo`, `CI`

Build a short internal list (5-10 keywords max, most specific first). Don't show this to the user — it's just for scoring.

---

## Phase 2 — Score against `INDEX.md`

Load the full catalog:

```bash
cat ~/Documents/claude-ecosystem/INDEX.md
```

For each artefact (skill / agent / command), score:

- **+4** if a TRIGGER keyword matches the user's keyword list (exact or obvious synonym)
- **+2** if the artefact's category or domain aligns (e.g. "LLM" keyword + skill in `context-cost/` category)
- **+1** if any word in the artefact's name or description appears in the user input
- **−4** if a SKIP keyword clearly excludes the user's context (e.g. SKIP says "non-LLM projects" but user's input is about LLM)
- **−2** if the artefact solves an adjacent-but-different problem (e.g. user wants "retry" but tool is about "prompt-optimize")

Keep top 3 by score. If the best score is below 3, treat as **no strong match**.

---

## Phase 3 — Classify each candidate

For each of the top 3, decide the verdict:

### A — **Already active** ✅

The candidate is either:
- A **universal skill/agent/command** (symlinked in `~/.claude/`) — always accessible
- A **per-project skill already installed** in this project's `.claude/skills/`

Action: tell the user it's already available + show how to invoke it (trigger keywords, slash command if applicable).

Check via:
```bash
ls ~/.claude/agents/ ~/.claude/commands/ ~/.claude/skills/ 2>/dev/null
# plus:
ls "$(pwd)/.claude/skills/" 2>/dev/null
```

### B — **Exists + install** 📥

The candidate is a **per-project skill** that exists in the ecosystem but is NOT installed in the current project.

Action: propose to install it via symlink:
```bash
ln -sf ~/Documents/claude-ecosystem/skills/<category>/<name> \
       "$(pwd)/.claude/skills/<name>"
```

Only offer this if in a project (`IN_PROJECT` non-empty). If outside a project, mention the skill exists and where.

### C — **Create new** 🆕

No candidate scored high enough (best score < 3) OR the candidates are close-but-not-quite (score 2-3 range).

Action: propose to **create a new skill** that targets the user's need. Delegate to the `skill-creator` skill for the actual creation — this skill just scopes the request:

```
No good match. Best near-miss: `<skill-name>` (score X — covers <related-but-different-thing>).

Options:
  1. Create a new skill — I'll delegate to `skill-creator`. Proposed name: `<kebab-case-suggestion>`. Proposed scope: <short description>.
  2. Extend an existing skill — edit `<skill-name>` to widen its triggers (only if the gap is small).
  3. Nothing — leave it.
```

### D — **No match + no-create** ❌

Sometimes the need is out of scope (e.g. user asks for something unrelated to coding, or duplicates a core Claude Code feature that shouldn't be reimplemented).

Action: say so briefly and suggest the right tool outside the ecosystem (e.g. "use the native `/plan` command", "this is what Context7 is for", "this would be better as a shell alias").

---

## Phase 4 — Present + user decision

Show a compact table:

```
NEED: "<user's original input>"

Top 3 matches:

| Skill / Agent / Command | Score | Category | Verdict | Note |
|---|---|---|---|---|
| `cost-aware-llm-pipeline` | 10 | context-cost | Install per-project | Covers retry+backoff, model routing, budget tracking on LLM calls |
| `silent-failure-hunter` | 4 | review (agent) | Already active | Adjacent — hunts swallowed errors, not retry logic |
| `api-connector-builder` | 3 | backend | Install per-project | Loosely matches if you're wrapping a new LLM provider |

Recommendation: INSTALL `cost-aware-llm-pipeline`.

Options:
  1. install `cost-aware-llm-pipeline` (top match)
  2. install a different one (give me the name from the list)
  3. show full description of `<name>`
  4. create a new skill for this need
  5. nothing
```

Wait for explicit user choice.

---

## Phase 5 — Execute the decision

### 5.1 — Install existing per-project skill

```bash
mkdir -p "$(pwd)/.claude/skills"
ln -sf ~/Documents/claude-ecosystem/skills/<cat>/<name> \
       "$(pwd)/.claude/skills/<name>"
echo "Installed: .claude/skills/<name> → ecosystem"
```

If `<project>/.claude/RESEARCH.md` exists, append an entry explaining the tool-finder addition (so the project history stays complete).

### 5.2 — Delegate to `skill-creator` for new skill creation

If user chose "create new", hand off to the `skill-creator` skill with:
- proposed name (kebab-case)
- proposed category (agents-meta / analysis / backend / frontend / testing / domain / quality / context-cost — pick the fit)
- a seed description paragraph drawn from the user's original need
- explicit TRIGGER and SKIP starter keywords

Example delegation prompt:

> "Create a new skill. Name: `llm-retry-backoff-patterns`. Category: `context-cost` (or `backend` if user prefers). Scope: guide LLM client retry-with-backoff patterns — token-bucket limits, exponential backoff, jitter, idempotent resumption, circuit-breaker on provider degradation. TRIGGER keywords: retry, backoff, LLM rate limit, 429, circuit breaker. SKIP: DB retries (different pattern), webhook retries (different concerns)."

After skill-creator finishes, **re-run tool-finder's Phase 5.1** to install the newly created skill into the current project.

### 5.3 — "Already active" path

No install needed. Just tell the user:

```
`<name>` is already active globally (or already installed in this project).
- To trigger it, mention: <some trigger keyword>.
- Or invoke directly: /<slash-command> (if applicable).
- Full description: see INDEX.md → <name>.
```

### 5.4 — "No match" path

Give one paragraph explaining why, and if there's an obvious external tool (Context7, native `/plan`, `/verify`, etc.), point there.

---

## Rules the skill follows

- **Never install without user approval.** Even top-scoring matches need explicit "yes, install it".
- **Never auto-create a new skill.** Always delegate to `skill-creator` after user confirmation.
- **Never install universal skills per-project** — they're already at `~/.claude/skills/`.
- **Never scan the ecosystem directly** — always read from `INDEX.md`. If INDEX is stale, suggest `/rebuild-ecosystem-index`.
- **Always show scoring transparently** — users should see why the match was chosen.
- **Always respect the "no strong match" threshold.** Don't force a bad fit just to give an answer. "No match + create" is a valid outcome.
- **Always update `<project>/.claude/RESEARCH.md`** if it exists, so the audit trail stays complete.

---

## Related tools

- `tool-project` — bootstrap the whole project toolbelt (use at repo entry, not for single-feature needs)
- `/rebuild-ecosystem-index` — refresh INDEX.md if the ecosystem changed recently
- `skill-creator` skill — delegated to when creating a new skill
- `/ecosystem-sync` — for landing newly created skills into the ecosystem repo
