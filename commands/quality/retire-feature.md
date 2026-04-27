---
description: Retire / remove a feature from the project safely (5-phase workflow — impact map, plan, surgical delete, orphan cleanup, verification)
argument-hint: <feature-name-or-slug>
---

# Retire Feature

Trigger the `feature-retirement` skill to safely remove the feature `$ARGUMENTS` from the current project.

**Input**: $ARGUMENTS

If `$ARGUMENTS` is empty, ask the user for the feature name + the 4 Phase 0 inputs (entry points, removal mode, out-of-scope items) before proceeding.

Otherwise, invoke the `feature-retirement` skill with the feature name and follow its 5-phase workflow:

1. Phase 0 — confirm scope with user (entry points, removal mode, out-of-scope)
2. Phase 1 — `code-explorer` agent → impact map
3. Phase 2 — `planner` agent → removal plan
4. Phase 3 — main-thread surgical deletion (with the side-channel checklist)
5. Phase 4 — `refactor-cleaner` agent → orphan cleanup
6. Phase 5 — `verification-loop` skill → gates

All artefacts land under `<project>/.claude/retirement/<slug>/`.
