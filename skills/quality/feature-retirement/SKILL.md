---
name: feature-retirement
description: "Use when the user wants to *intentionally* remove or retire a feature/module/endpoint/job from a project safely — without breaking callers, leaving orphaned code, or forgetting side-channel dependencies (DB tables, env vars, feature flags, dashboards, cron jobs, docs). Orchestrates a 5-phase workflow: impact map → removal plan → surgical deletion → orphan cleanup → verification. TRIGGER: 'remove feature X', 'retire X', 'rip out X', 'kill switch X', 'deprecate and delete', 'supprime cette feature', 'retirer ce code', 'enlever ce module', 'on n'utilise plus X', 'sans rien casser', '/retire-feature'. Make sure to use this skill whenever those phrases appear — even if the user doesn't say 'safely'. SKIP: auto-detected dead code with no known caller (use refactor-cleaner agent directly), single-file rename or extract-method (just edit), bug fixes, dependency upgrades, version migrations, switching feature flags ON (this is for OFF + delete), incremental refactors that keep the feature."
origin: ECC
---

# Feature Retirement

Remove a known feature from a real codebase without breaking the rest of it. The hard part isn't deleting code — it's finding everything the feature touched and ordering the deletion so each step leaves the repo in a runnable state.

This skill **orchestrates existing tools** (agents + skills) and adds a checklist of the side channels that get forgotten. The main thread does the actual edits so the user can review every diff.

---

## When to use

- User points at a named feature, endpoint, module, job, MCP server, integration, etc. and wants it gone.
- The feature is non-trivial (≥2 files, or has DB/config/env/feature-flag dependencies).
- The user wants the deletion to be **reviewable in chunks** rather than one giant diff.

## When NOT to use

- The user is hunting *unknown* dead code → use `refactor-cleaner` agent directly.
- Single-file rename, extract-method, in-place refactor → just edit.
- Adding a feature flag to *gate* the feature (without deleting) → this skill is for the *delete after gate* phase.
- Bug fixes, dep upgrades, version migrations.

## The 5-phase workflow

The skill enforces these phases in order. Don't skip — each phase produces an artefact the next phase needs.

### Phase 0 — Confirm scope (in main thread, ≤2 min)

Before any agent call, lock down the scope **with the user**:

1. **Feature name** — short slug, used in artefacts (`<slug>` below).
2. **Best guess at primary entry points** — file paths, route paths, function names, CLI commands. Get 2–5 anchors from the user; full mapping happens in Phase 1.
3. **Removal mode** — pick one explicitly:
   - **Hard delete** — remove now, no users left. Default for internal/staff features.
   - **Deprecate then delete** — the feature is still called externally. Add a deprecation warning + telemetry first, schedule the actual delete for later (suggest `/schedule` for the cleanup PR).
   - **Migrate then delete** — callers must move to a replacement first. Phase 2 has to enumerate them.
4. **Out of scope** — what looks related but **must NOT** be deleted (shared utilities, sibling features). Get this from the user — it prevents over-eager removal.

Write these 4 items as a short brief that gets reused in every phase below. If the user can't answer one of them, **stop** and ask. Don't guess on removal mode.

### Phase 1 — Impact map (delegated → `code-explorer`)

Goal: produce a complete map of what the feature touches and what touches the feature. Delegate this to the `code-explorer` agent — it's read-only, parallelisable, and has the right tool access.

Spawn the agent with a self-contained prompt that includes:

```
Map the impact of removing the feature "<slug>".

Anchors (from the user):
- <entry point 1>
- <entry point 2>
- ...

Out of scope (do NOT include in the map):
- <items from Phase 0>

Produce a markdown report under 400 words with these sections:

1. **Owned files** — files that exist solely for this feature. Format: `path | role`.
2. **Shared files with feature-only sections** — files that contain *some* feature-specific code mixed with code that must stay. Format: `path | line range | role`. These are the surgery-required spots.
3. **Inbound callers** — every place that calls into the feature (function calls, HTTP routes, message subscribers, CLI invocations, imports). Format: `caller path:line → entry point`. Distinguish internal vs external callers.
4. **Outbound dependencies** — every external thing the feature consumes (libs, internal modules, external HTTP APIs, DB collections/tables, queues, env vars). Format: `dep | usage | path:line`.
5. **Side channels** — DB schemas/collections/tables, feature flags, env vars, cron/scheduled jobs, dashboards, alerts, log filters, fixtures, seeds, docs, README sections, OpenAPI specs, GraphQL schemas, MCP manifests, telemetry events, CI workflows referencing the feature.
6. **Tests** — test files that exclusively test this feature, and tests that touch it as a side-effect.

Report under 400 words. Use file:line refs. Do not propose deletions yet — only map.
```

When the agent returns, save the map to `<project>/.claude/retirement/<slug>-impact.md` so the next phases can refer to it. If `<project>/.claude/retirement/` doesn't exist, create it.

### Phase 2 — Removal plan (delegated → `planner`)

Goal: turn the impact map into a phased deletion plan where **each phase leaves the repo runnable**.

Spawn the `planner` agent with the impact map and the removal mode from Phase 0. Ask for:

1. **Phase ordering** — concrete numbered steps. Standard ordering:
   - (a) For *deprecate* mode: add deprecation warning + telemetry to entry points, ship, **stop here** for now.
   - (b) For *migrate* mode: implement replacement (or confirm exists) → migrate each caller → wait for caller traffic to drop to zero → proceed to (c).
   - (c) Remove inbound callers (or confirm none remain).
   - (d) Remove owned files.
   - (e) Surgery on shared files (extract feature-only code, leave the rest).
   - (f) Drop side channels: DB schema (with migration), feature flags, env vars, cron jobs, dashboards, alerts.
   - (g) Drop tests + fixtures owned by the feature; update tests that reference it.
   - (h) Drop docs, OpenAPI/GraphQL specs, README sections.
   - (i) Final verification (Phase 4).
2. **PR boundaries** — which steps can ship together vs which need their own PR. Default: (a) and (b) are separate PRs; (c)–(h) can be one PR if small, multiple if large.
3. **Risks per step** — what could break, how to detect it.
4. **Rollback strategy per PR** — git revert plan + any DB migration reversals.

Save the plan to `<project>/.claude/retirement/<slug>-plan.md`.

### Phase 3 — Surgical deletion (in main thread, NOT delegated)

The deletion happens in the main thread so the user reviews each diff. **Do not delegate this to a sub-agent** — opaque deletions are the failure mode this skill exists to prevent.

For each step in the plan, in order:

1. State the step + the files about to change.
2. Make the edits.
3. After each step, run a fast sanity command (typecheck, syntax check, or import check — whatever the project supports). Do not move to the next step until the current one is clean.
4. If a side-channel deletion is involved (DB migration, env var removal, dashboard YAML), produce the migration/diff and call it out explicitly — these are the steps most likely to break prod.

Mandatory side-channel checklist (cross-reference against the impact map's section 5):

- [ ] Feature flags removed from flag service + code references
- [ ] Env vars removed from `.env.example`, deployment manifests, secret managers (note for the user — don't touch live secret managers without confirmation)
- [ ] DB schema migration written + reviewed (down migration too)
- [ ] Cron/scheduled jobs removed from scheduler config
- [ ] Dashboards / alerts / log filters updated
- [ ] OpenAPI / GraphQL / MCP manifests regenerated
- [ ] CI workflow steps that referenced the feature removed
- [ ] Telemetry events: stop emitting, but consider a grace window before deleting downstream consumers
- [ ] Docs + README + CHANGELOG entry

Any unchecked item at the end of Phase 3 = **stop and ask the user** before proceeding to Phase 4.

### Phase 4 — Orphan cleanup (delegated → `refactor-cleaner` agent)

After the planned deletions, the repo may have new orphans: helpers that were only called by the deleted feature, unused imports, dead constants, unused fixtures. Spawn `refactor-cleaner`:

```
The feature "<slug>" was just removed. Files affected: <list from Phase 3>.

Run knip / depcheck / ts-prune (or the language equivalent — pyflakes, vulture for Python, etc.) and produce a list of newly-orphaned symbols. Propose deletions but DO NOT delete anything that pre-dates this retirement (we only want orphans created by removing "<slug>").

Report under 200 words. Format: `path:line | symbol | confidence`.
```

Apply the orphan deletions in the main thread (review each one — auto-detection has false positives, especially on dynamic imports and reflection).

### Phase 5 — Verification (delegated → `verification-loop` skill)

Trigger the `verification-loop` skill (or run the project's full gate manually if the skill is unavailable):

- Build / typecheck
- Lint
- Unit + integration tests with coverage
- Security scan
- Diff review against `main`

If any gate fails:
- If the failure references the deleted feature → Phase 3 missed a spot, go back.
- If the failure is unrelated → flag to the user, don't auto-fix in this workflow.

When all gates pass, write a final summary to `<project>/.claude/retirement/<slug>-summary.md`:

- What was removed (high-level)
- Which side channels were touched
- Migration steps the deployer must run (DB migrations, secret rotations, dashboard updates)
- Anything deferred (e.g. deprecation period for *deprecate* mode — recommend `/schedule` an agent for the eventual delete)

---

## Output artefacts

Everything lands under `<project>/.claude/retirement/<slug>/`:

- `<slug>-impact.md` — Phase 1 output
- `<slug>-plan.md` — Phase 2 output
- `<slug>-summary.md` — Phase 5 output

These survive the session so a future Claude (or human reviewer) can audit the removal.

---

## Failure modes this skill prevents

1. **Forgotten side channels.** The mandatory checklist in Phase 3 is the whole point. Code grep alone misses dashboards, env vars, scheduled jobs, alert rules.
2. **Cascading breakage from caller deletion order.** Phase 2's ordering (callers before owned files) ensures the repo is runnable at every commit.
3. **Opaque sub-agent deletions.** Phase 3 stays in the main thread on purpose. Any tool that says "I'll just delete it for you" without showing the diff = the failure mode.
4. **Dead-code false positives.** Phase 4 only flags orphans *created by this retirement*, not pre-existing dead code.
5. **External callers losing access without notice.** Phase 0's removal-mode question forces the deprecate-vs-delete decision up front.

---

## Related tools

- `code-explorer` agent — Phase 1 (impact map)
- `planner` agent — Phase 2 (removal plan)
- `refactor-cleaner` agent — Phase 4 (orphan cleanup)
- `verification-loop` skill — Phase 5 (gates)
- `feature-digest` skill — *before* retirement, optional, to capture what the feature did before it disappears (good for postmortems / future "why did we have X")
- `/schedule` — for *deprecate* mode, schedule the eventual delete PR
