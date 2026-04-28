---
description: Multi-cycle, multi-agent bug eradication loop — fans out parallel reviewer pairs per zone, debates fixes to consensus, applies, loops with fresh agents until 2 zero-finding cycles. Runs hands-off, no push.
argument-hint: <feature-path | glob | "all">
---

# Bug Killer Loop

Trigger the `bug-killer-loop` skill on `$ARGUMENTS`.

**Input**: $ARGUMENTS

If `$ARGUMENTS` is empty, ask the user for the target — feature path, glob, or `all` for the whole repo.

Otherwise, invoke the `bug-killer-loop` skill and follow its 7-phase workflow:

1. Phase 0 — bootstrap (branch + baseline snapshot + bug-cycles/ dir)
2. Phase 1 — zone decomposition (≤600 lines per zone)
3. Phase 2 — parallel audit (up to 10 pairs of silent-failure-hunter + code-reviewer)
4. Phase 3 — aggregation + dedup
5. Phase 4 — validation gate (cycle ≥3 OR <3 findings → bug-validator)
6. Phase 5 — consensus fix loop (option B back-and-forth, max 4 rounds, 2-attempt verification)
7. Phase 6 — cycle report (`.claude/bug-cycles/cycle-N.md`)
8. Phase 7 — loop until 2 consecutive zero-finding cycles or hard cap (10 cycles)

Hands-off after Phase 0 confirmation. Strict scope (fixes can touch out-of-zone files). No push at termination.
