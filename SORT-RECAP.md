# Sort recap — agents / commands / rules / skills

## 1. Final structure

| Top-level | Subfolders (count) | Total |
|---|---|---|
| `agents/` | `analysis` (5), `architecture` (2), `review` (6), `testing` (6) | **19** |
| `commands/` | `analysis` (6), `planning` (5), `quality` (6), `testing` (3) | **20** |
| `rules/` *(newly sorted)* | `core` (3), `workflow` (4), `quality` (2), `domain` (3) | **12** |
| `skills/` *(newly sorted)* | `agents-meta` (13), `analysis` (6), `backend` (9), `context-cost` (5), `frontend` (4), `mcp` (1), `quality` (4), `telnyx` (8), `testing` (7) | **57** |

### `rules/` placements
- **core** — must-always-must-never, coding-style, security
- **workflow** — git-workflow, development-workflow, agent-orchestration, model-selection
- **quality** — code-review, testing
- **domain** — mcp-server-best-practices, rag-best-practices, voice-ai-best-practices

### `skills/` placements (high-level)
- **agents-meta** — agent-eval, agent-harness-construction, agent-introspection-debugging, autonomous-agent-harness, blueprint, continuous-agent-loop, council, dmux-workflows, prompt-optimizer, rules-distill, santa-method, skill-creator, verification-loop
- **analysis** — codebase-onboarding, code-tour, deep-research, documentation-lookup, repo-scan, search-first
- **backend** — api-connector-builder, api-design, backend-patterns, bun-runtime, database-migrations, deployment-patterns, docker-patterns, hexagonal-architecture, python-patterns
- **context-cost** — context-budget, cost-aware-llm-pipeline, iterative-retrieval, strategic-compact, token-budget-advisor
- **frontend** — design-system, frontend-design, frontend-patterns, nextjs-turbopack
- **mcp** — mcp-builder
- **quality** — accessibility, coding-standards, cpp-coding-standards, plankton-code-quality
- **telnyx** — telnyx-ai-outbound-voice-python, telnyx-messaging-profiles-python, telnyx-messaging-python, telnyx-numbers-config-python, telnyx-numbers-python, telnyx-voice-advanced-python, telnyx-voice-python, telnyx-voice-streaming-python
- **testing** — benchmark, cpp-testing, eval-harness, playwright-qa, python-testing, tdd-workflow, webapp-testing

---

## 2. Duplicate / overlap analysis

**Legend:** 🔁 shim = intentional legacy command aliasing a skill · 🔗 pair = agent+command that naturally go together (command dispatches agent) · ⚠️ overlap = genuine near-duplication worth consolidating.

| Theme | Rule | Agent | Command | Skill | Verdict |
|---|---|---|---|---|---|
| **Code review** | quality/code-review | review/code-reviewer, typescript-reviewer, cpp-reviewer, security-reviewer, performance-optimizer | quality/code-review, quality/review-pr, quality/cpp-review | — | `/code-review` → local only; `/review-pr` → multi-agent PR dispatcher; cpp-review 🔗 cpp-reviewer. Density = spécialisation intentionnelle (general + 2 langues TS/C++ + 2 domains security/perf), pas à consolider |
| **TDD** | quality/testing | testing/tdd-guide | — | testing/tdd-workflow | rule + agent + skill (healthy) |
| **E2E / browser** | — | testing/e2e-runner | — | testing/playwright-qa, webapp-testing | 2 skills with distinct scopes (docs + Python toolkit) |
| **Build-fix (generic)** | — | testing/build-error-resolver | testing/build-fix | — | 🔗 pair |
| **Build-fix (C++)** | — | testing/cpp-build-resolver | testing/cpp-build, cpp-test | testing/cpp-testing, quality/cpp-coding-standards | 🔗 pair + adjacent |
| **Docs lookup (Context7)** | — | — | — | analysis/documentation-lookup | clean (skill only) |
| **Eval** | — | — | analysis/eval 🔁 | testing/eval-harness, agents-meta/agent-eval | 2 distinct purposes |
| **Planning** | — | architecture/architect, planner | planning/plan, multi-plan | agents-meta/blueprint, council | scopes distincts : `architect` = design/ADR/tradeoffs, `planner` = step-by-step plan avec file paths. Frontmatter descriptions tightened pour clarifier la chaîne architect → planner |
| **Harness audit** | — | analysis/harness-optimizer | analysis/harness-audit | agents-meta/agent-harness-construction | healthy chain (measure → improve → design) |
| **Context / token budget** | — | — | analysis/context-budget 🔁 | context-cost/context-budget, token-budget-advisor, strategic-compact | healthy trio : `context-budget` = mesurer overhead statique, `token-budget-advisor` = choisir profondeur réponse runtime, `strategic-compact` = timer `/compact` aux phases |
| **Prompt optimize** | — | — | quality/prompt-optimize 🔁 | agents-meta/prompt-optimizer | 🔁 one chain |
| **Verify** | — | — | quality/verify 🔁 | agents-meta/verification-loop | 🔁 one chain |
| **Quality gate** | — | — | quality/quality-gate | quality/plankton-code-quality | complémentaires (command = entry point opérateur, skill = doc intégration Plankton) |
| **Rules / learning** | — | — | analysis/learn | agents-meta/rules-distill | different scopes (session→skill vs skills→rule), healthy |
| **MCP servers** | domain/mcp-server-best-practices | — | — | mcp/mcp-builder | clean (1 rule + 1 skill) |
| **Autonomous loops / orchestration** | workflow/agent-orchestration | — | — | agents-meta/continuous-agent-loop, autonomous-agent-harness, dmux-workflows | 3 distinct roles (patterns / scheduling / parallel panes) |
| **Model routing / cost** | workflow/model-selection | — | analysis/model-route | context-cost/cost-aware-llm-pipeline | trio stays (policy / runtime / pipeline) |
| **Coding standards** | core/coding-style | — | — | quality/coding-standards, cpp-coding-standards | fine (rule = baseline) |
| **Voice AI / telephony** | domain/voice-ai-best-practices | — | — | telnyx/* (8) | fine (1 rule, 8 domain skills) |
| **RAG** | domain/rag-best-practices | — | — | context-cost/iterative-retrieval | minimal overlap |
| **Session mgmt** | — | — | planning/checkpoint, save-session, resume-session | — | scopes distincts : `/checkpoint` = phases git intra-session, `/save-session` + `/resume-session` = handoff markdown inter-session |

---

## 3. Headline duplicates to act on

- **4 surviving shim commands** (🔁): `context-budget`, `eval`, `prompt-optimize`, `verify` — see section 4.
- **4 agent↔command pairs** (🔗): `build-fix`, `cpp-build`, `cpp-test`, `cpp-review` — healthy, command dispatches agent.
- **Top-3 overlaps — status after consolidation pass:**
  1. ~~E2E / browser testing — 3 skills circling Playwright~~ → **résolu** : fusion de `e2e-testing` + `browser-qa` en `playwright-qa` ; `webapp-testing` gardé à part (Python toolkit).
  2. ~~Autonomous loops — 4 skills~~ → **résolu** : contenu de `autonomous-loops` migré dans `continuous-agent-loop`, ancien fichier supprimé. `autonomous-agent-harness` et `dmux-workflows` gardés (rôles distincts).
  3. Harness audit — **faux positif** (3 artefacts = chaîne saine mesurer → améliorer → concevoir).
- **Highest artifact density:** `code-review` (1 rule + 5 specialized reviewer agents + 3 commands) — **spécialisation intentionnelle confirmée** (general + TS + C++ + security + perf), pas de consolidation.

---

## 4. Surviving shim commands

### 4.1. Shared template

All 4 surviving shims use the same 4-block structure:

```
---
description: Legacy slash-entry shim for the <X> skill. Prefer the skill directly.
---

# <Name> (Legacy Shim)
Use this only if you still invoke `/<name>`. The maintained workflow lives in `skills/<X>/SKILL.md`.

## Canonical Surface
- Prefer the `<X>` skill directly.
- Keep this file only as a compatibility entry point.

## Arguments
`$ARGUMENTS`

## Delegation
Apply the `<X>` skill.
- <mode-specific bullet 1>
- <mode-specific bullet 2>
- <mode-specific bullet 3>
```

Only the **Delegation bullets** vary — they set the *operating mode* of the underlying skill. All 4 files are clean ~24-line shims (no legacy body).

### 4.2. Role of each survivor

| Shim | Target skill | What it's for | Delegation contract |
|---|---|---|---|
| `/verify` | `agents-meta/verification-loop` | Build / types / lint / tests / security / diff gates after changes | Pick verification depth, run phases in order, report verdicts + blockers |
| `/prompt-optimize` | `agents-meta/prompt-optimizer` | Rewrite a draft prompt with ECC components mapped | **Advisory-only** — does not execute the task |
| `/context-budget` | `context-cost/context-budget` | Audit token overhead across agents/skills/MCP/rules | `--verbose` pass-through, 200k window, prioritized savings |
| `/eval` | `testing/eval-harness` | Drive EDD lifecycle (define / check / report / list / cleanup) | Capability-first, regression-backed |

### 4.3. Why these 4

They all toggle a specific **operating mode** that natural language can't reliably trigger:

- `/verify` — no natural phrase fires a multi-phase gate run
- `/prompt-optimize` — the skill *refuses* to execute, so the mode switch needs an explicit entry
- `/context-budget` — deliberate audit action; nothing else auto-fires
- `/eval` — opt-in entry to the EDD lifecycle
