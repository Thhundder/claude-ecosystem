---
name: realtime-prompt-migration
description: Migrate OpenAI Realtime voice prompts from gpt-realtime-1.5 (or earlier) to gpt-realtime-2. Use this skill whenever the user is migrating a voice agent prompt to the new realtime model, auditing an existing voice prompt for v2 compatibility, debugging unexpected behavior after a model bump from 1.5 to 2, restructuring a flat voice prompt into the canonical v2 sections, restructuring a dynamically-assembled prompt builder for prefix-cache friendliness (static-first / dynamic-last ordering), or adding v2 features (preambles, reasoning effort, channels, entity capture, tool eagerness) to an existing prompt. Trigger even if the user just says "the voice agent behaves weirdly since the model bump", "I migrated to gpt-realtime-2 and now it confirms everything", or "my prompt is built dynamically and I want to optimize input token cost" — these are all addressed here.
---

# Realtime Prompt Migration (gpt-realtime-1.5 → gpt-realtime-2)

This skill helps migrate OpenAI Realtime voice agent prompts to be v2-ready. The skill exists because `gpt-realtime-2` follows instructions **more literally** than `gpt-realtime-1.5`, which causes prompts that worked fine on 1.5 to produce rigid, surprising, or buggy behavior on 2.

## When this skill applies

- The user is migrating a voice agent from `gpt-realtime-1.5` (or `gpt-realtime`) to `gpt-realtime-2`
- The user reports that their agent "confirms everything" or "asks too many questions" since the model bump → classic literal-interpretation bug
- The user wants to add v2 features to an existing prompt: preambles, reasoning effort, tool eagerness, entity capture
- The user wants to audit an existing prompt for v2 readiness without yet migrating

## Workflow

### Step 1 — Diagnose what you have

Read the original prompt the user provides. Before doing anything else, classify it:

- **Is it structured by sections** (`# Role`, `# Tools`, etc.) or **flat prose**?
- **Is it static (a single hand-written prompt) or dynamic (assembled by code from feature flags / runtime values)?** If dynamic, identify the builder function and enumerate the axes of variation. Caching strategy depends entirely on this.
- **Does it use absolute words** (`always`, `never`, `must`, `only`, `forbidden`) and how many?
- **Does it reference tools**? If yes, does it specify when to call vs when NOT to call each?
- **Does it have any preamble guidance**?
- **Does it lock the response language**?
- **Does it handle exact entities** (order IDs, phone numbers, emails)?

If the prompt is large (>500 lines), ask the user which sections they want prioritized for the migration.

### Step 2 — Run the validation scripts

The skill includes three validation scripts in `scripts/`. Run them on the original prompt to get a quantitative baseline before migration:

- `scripts/validate_structure.py path/to/prompt.md` — Checks which canonical sections exist
- `scripts/detect_hard_constraints.py path/to/prompt.md` — Counts `always`/`never`/`must`/`only` and flags risky ones
- `scripts/check_preamble_section.py path/to/prompt.md` — Checks if tools are referenced without a corresponding Preambles section

These scripts produce a JSON report. Use it as the migration baseline.

### Step 3 — Choose the right meta-prompt

The skill provides three meta-prompts in `meta-prompts/` depending on the user's goal:

- **`meta-prompts/full-migration.md`** — The user wants a complete restructure of their prompt for v2. Use this for the main migration PR.
- **`meta-prompts/critique-only.md`** — The user wants an audit of their prompt without restructuring. Use when they want to understand what's wrong before deciding to migrate.
- **`meta-prompts/targeted-fix.md`** — The user observes a specific bug in production and wants prompt variants to fix that one bug. Use for production iteration, not for the migration itself.

For the migration PR workflow specifically, use `full-migration.md`.

### Step 4 — Load the references

Before applying changes, read these reference files:

- `references/v2-changes-summary.md` — What changed from 1.5 to 2, with examples of bugs introduced
- `references/canonical-sections.md` — The 12 canonical sections and when to use each
- `references/common-pitfalls.md` — Known migration pitfalls and how to avoid them
- `references/prefix-caching.md` — **Mandatory if the prompt is dynamically assembled by code.** Explains OpenAI's automatic prefix caching, the static-first / dynamic-last section ordering rule, common cache killers (dates, IDs, non-deterministic ordering), and how to verify with `cached_tokens` in usage logs.

These references encode hard-won knowledge from the OpenAI v2 guide. Read them BEFORE proposing a migrated prompt.

### Step 5 — Produce the migrated prompt

Output structure:

1. **Migration Diagnosis** — issues found, organized by category (structure, constraints, conflicts, preambles, reasoning, tools, entities, audio, language, **cache-friendly ordering** if dynamic)
2. **Migration Plan** — before/after for each change, with rationale
3. **Migrated Prompt** — the full restructured prompt ready to use. **If the prompt is dynamically assembled, the migration must also reorganize the builder so all static sections come first and all feature/runtime-dependent sections come last** (see `references/prefix-caching.md`). Annotate the boundary in the builder code so future maintainers cannot accidentally interleave dynamic content into the static prefix.
4. **Open Questions** — places where the original prompt was ambiguous and the user must disambiguate before finalizing
5. **Test Scenarios** — 5-10 specific scenarios to run against the migrated prompt to verify no regression vs 1.5 behavior. **For dynamic prompts, also include a snapshot test that pins the static-prefix bytes** so any future drift is caught in CI rather than silently halving the cache hit rate.

### Step 6 — Validate the migrated prompt

Re-run the three validation scripts on the migrated prompt. The validation report should show:
- All canonical sections present (where relevant)
- Hard constraint count reduced or all remaining constraints justified
- Preambles section present if tools are referenced

If validation fails on the migrated prompt, iterate.

## What NOT to do

- **Do not invent new tools, features, or business rules** not present in the original prompt
- **Do not remove instructions whose intent is unclear** — flag them as Open Questions instead
- **Do not change the brand voice, personality, or core business logic** during migration
- **Do not apply v2 changes blindly** — every section added must serve the original prompt's use case

## Examples

See `examples/before-v1.5.md` and `examples/after-v2.md` for a complete reference migration on a phone booking agent prompt. Read these when you need to ground your migration in a concrete reference.

## Notes on common bugs from v2 literal interpretation

If the user reports any of these symptoms post-migration, this skill addresses them:

- **"The agent confirms everything now"** → Hard constraint overuse (`always confirm`, `must verify`). See `references/common-pitfalls.md` section "Constraint relaxation".
- **"The agent goes silent for 2 seconds before responding"** → No preambles section. See `references/canonical-sections.md` section "Preambles".
- **"The agent switches to English when the customer has a French accent"** → No language locking. See `references/canonical-sections.md` section "Language".
- **"The agent reads back order IDs as full numbers, misses digits"** → No entity capture rules. See `references/canonical-sections.md` section "Entity Capture".
- **"The agent calls tools with partial or wrong identifiers"** → No exact identifier confirmation rule.
- **"The agent responds to background noise / TV / hold music"** → No Unclear Audio section or no `wait_for_user` tool.
