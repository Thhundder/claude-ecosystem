---
name: bug-killer-loop
description: "Use to run an aggressive, multi-cycle, multi-agent bug-killing pass on a feature or whole codebase — splits the target into small zones, fans out parallel pairs of (silent-failure-hunter + code-reviewer) agents per zone, makes the two agents debate to reach consensus on each fix, applies fixes in the main thread, then loops with fresh agents until two consecutive cycles return zero findings. From cycle 3+, every flagged bug is first checked by `bug-validator` to filter hallucinations. Runs hands-off — no per-cycle gates. Per-cycle markdown report under `.claude/bug-cycles/`. Cost-not-an-issue: spawns up to 10 parallel agent pairs at once. TRIGGER: 'bug-killer', 'kill all bugs', 'auto-fix all bugs', 'fix everything in this feature', 'multi-agent bug hunt', 'consensus fix', '/bug-killer-loop', 'lance la boucle bug-killer', 'fix tout dans cette feature', 'audit + fix automatique'. Make sure to use this skill whenever the user wants a *thorough, looped, hands-off* bug pass — not just a one-shot review. SKIP: single-bug fixes (just fix it inline), greenfield code with no bugs to hunt, code review of a small diff (use code-reviewer agent directly), feature retirement (use feature-retirement skill), security audit only (use security-reviewer agent directly), performance tuning (use performance-optimizer)."
origin: ECC
---

# Bug Killer Loop

A relentless, multi-cycle bug elimination pipeline. Two reviewer agents debate every finding to reach consensus on a fix, the main thread applies it, and the whole thing loops with fresh agents until clean. From cycle 3, an independent validator filters hallucinations.

This is not a code review. It's an **eradication pass** — designed to keep going past the point where a single audit would stop.

---

## Operating principles

- **Two heads, one fix.** Each bug is debated by `silent-failure-hunter` and `code-reviewer` until they agree on the patch. No fix ships unless both reviewers signed off.
- **Parallel zones, sequential fixes.** Many features audited at once; fixes within a feature go critical-first, one at a time.
- **Fresh agents per cycle.** Every loop spawns new agents with no prior-cycle context — prevents convergence-by-confirmation-bias.
- **Strict scope.** If a zone audit reveals a bug in another file (shared util, imported helper), that fix is in scope. The full audit-finding set is the work, not the original target zone.
- **Hands-off.** No gates between cycles. Runs to completion (or hard-cap).
- **Anti-hallucination.** From cycle 3+ — or from cycle 2 if findings drop below 3 — every flagged bug passes through `bug-validator` before any debate begins.
- **Token cost is not the constraint.** Run as many parallel agents as the harness will accept (cap: 10 pairs concurrent). User has explicitly waived cost optimization.

---

## When to use

- The user has an existing codebase / feature with suspected accumulated issues, and wants a *complete sweep*, not a one-shot review.
- The user is willing to let a long, automated process run.
- The user accepts that fixes may touch files outside the original scope (strict-scope mode).

## When NOT to use

- Single bug, single file → just fix it.
- Feature *removal* → `feature-retirement` skill.
- Code review of a small diff (PR-sized) → `code-reviewer` agent directly.
- Greenfield / first commit → no accumulated bugs to hunt.
- Code under another team's ownership where fixes need their review → use audit-only path (run hunters without the fix loop).

---

## Inputs

The user invokes via slash command or natural language. The skill needs:

1. **Target** — one of:
   - A feature path (e.g. `app/services/voice/session/`)
   - A glob (e.g. `app/services/voice/**`)
   - The whole repo (`.` or `all`)
2. **Branch** — optional. If not specified, work on a fresh `bug-killer/<target-slug>-<YYMMDD>` branch.
3. **Termination override** — optional. Default: 2 consecutive zero-finding cycles, hard cap 10 cycles.

If the user asks ambiguously ("kill the bugs"), ask for the target. Don't infer.

---

## Phase 0 — Bootstrap (≤2 min)

1. Confirm the target with the user (one line, e.g. *"target = `app/services/voice/`, OK?"*).
2. Create branch `bug-killer/<target-slug>-<YYMMDD>` and check out.
3. Make sure `<project>/.claude/bug-cycles/` exists. Create `<project>/.claude/bug-cycles/INDEX.md` if missing (header only — entries are appended per-cycle).
4. Run a single sanity build/typecheck/test snapshot — record baseline pass/fail status to `bug-cycles/baseline.md`. Used later to distinguish pre-existing failures from regressions caused by fixes.

**No further user input required from here on out** — the loop is hands-off.

---

## Phase 1 — Zone decomposition

Split the target into auditable **zones**. A zone is a coherent slice that one (silent-failure-hunter, code-reviewer) pair can audit deeply within their token budget.

### Decomposition rules

- **Default unit**: one directory at the deepest level that has ≥1 source file.
- **Soft cap**: ≤600 lines of source per zone. If a directory exceeds this, split by file groupings (e.g. `session/session.py` alone, then `session/{rag,interruption,timeouts}.py`).
- **Group related**: tests stay attached to the implementation zone they cover.
- **Skip**: vendored deps (`.venv`, `node_modules`), build outputs, generated code, fixtures unless explicitly named.
- **Flat structures**: if the target is a flat directory of unrelated files, delegate to `code-explorer` agent to cluster them into semantic zones first.

Output: a manifest `bug-cycles/zones-cycle-<N>.md`:

```
## Zones — cycle N
1. `app/services/voice/session/` (4 files, ~520 lines)
2. `app/services/voice/integrations/` (6 files, ~810 lines — split: 2a integrations/openai_client.py + telnyx_client.py, 2b rest)
3. ...
```

---

## Phase 2 — Parallel audit (fan-out)

For each zone, spawn **a pair** of read-only audit agents in parallel:

- `silent-failure-hunter` — catch swallowed errors, fire-and-forget tasks, missing error propagation, deadlock risks
- `code-reviewer` — quality, edge cases, type/null safety, contract violations, missing validation

**Parallelism cap**: 10 pairs (= 20 agents) concurrent. If more zones exist, queue the remainder. Each pair runs independently — no shared context.

### Prompt template (same for both agents in a pair)

```
Audit the following zone for bugs / issues.

Zone: <zone-N>
Files: <list of files in this zone>

Out of scope:
- Files outside this zone (mention them in your report only if a bug in scope causes a problem there)
- Style preferences not tied to a real bug
- Theoretical "what-if" scenarios with no concrete trigger path

For each finding:
- File: <path>
- Line(s): <range>
- Severity: CRITICAL | HIGH | MEDIUM | LOW
- Type: <short pattern name>
- Description: <one paragraph>
- Trigger path: <how this fires in production — if you can't articulate one, do not report>
- Proposed fix: <one paragraph — be concrete>

Report under 600 words. Use this format. Be terse.
```

Collect both reports. Save to `bug-cycles/cycle-<N>/zone-<i>/{hunter,reviewer}.md`.

---

## Phase 3 — Aggregation & dedup

Per cycle:

1. **Dedupe within a zone**: if both agents flagged the same `(file, line-range, type)`, merge into one finding with `consensus_signal: high` (both saw it).
2. **Dedupe across zones**: if a bug spans two zones (e.g. shared util), merge keeping the highest severity reported.
3. **Sort**: CRITICAL → HIGH → MEDIUM → LOW. Tie-break by `consensus_signal: high` first.

Output: `bug-cycles/cycle-<N>/findings.md` — one canonical list.

---

## Phase 4 — Validation gate (cycle ≥3 OR <3 findings)

Trigger condition:

- Current cycle index ≥3, **OR**
- Total finding count for this cycle <3 (probably nearing convergence — false positive risk rising)

When triggered:

For each finding, spawn a fresh `bug-validator` agent in parallel (cap: 10 concurrent). Each gets the finding + the cited code excerpt. Verdict categories: REAL / OVERSTATED / THEORETICAL / MISREAD / CANNOT_VERIFY.

Filter rules:

- **REAL** → keep, proceed to Phase 5
- **OVERSTATED** → keep but downgrade severity per the validator's recommendation
- **THEORETICAL** or **MISREAD** → drop. Log the drop in the cycle report under "Hallucinations filtered".
- **CANNOT_VERIFY** → keep but tag as `needs-human` — skip in the auto-fix loop, surface in cycle report.

---

## Phase 5 — Consensus fix loop (per finding)

Process findings **sequentially within a zone, parallel across zones** (max 10 zones in flight). Within a zone, go critical-first.

For each finding:

### Step 5.1 — Round 1: Reviewer A proposes

- Reviewer A = `silent-failure-hunter` (or whichever agent originally found the bug — the one with stronger signal goes first)
- Spawn fresh agent. Prompt:

```
You are proposing a concrete code patch for the following bug.

Bug:
<finding from Phase 3>

Output a unified diff or a literal "before/after" code block. Be precise — line numbers, indentation, exact tokens. Explain the rationale in 2 sentences. No commentary beyond that.

You will then be reviewed by a peer. If they counter-propose, you may either (a) approve their counter, or (b) defend yours with a 2-sentence rebuttal.
```

Save proposal to `bug-cycles/cycle-<N>/zone-<i>/finding-<j>/round-1-propose.md`.

### Step 5.2 — Round 2: Reviewer B reviews

- Reviewer B = the other audit agent for that zone.
- Spawn fresh. Prompt:

```
A peer reviewer has proposed the following patch for a bug.

Bug:
<finding>

Peer's proposal:
<round-1 output>

Decide:
- APPROVE — the patch is correct and minimal, OR
- COUNTER — propose an alternative patch

If COUNTER: output your alternative in the same format (diff or before/after) plus a 2-sentence rationale explaining why your version is better.

If APPROVE: output exactly "APPROVE" on the first line, then a 1-sentence acknowledgment.
```

Save to `round-2-review.md`.

### Step 5.3 — Loop until consensus (max 4 rounds total = 2 round-trips)

- If round 2 = APPROVE → consensus reached, jump to Step 5.4.
- If round 2 = COUNTER → spawn round-3 with reviewer A: same template, but they see both rounds 1 and 2.
- If round 4 still no agreement → tag finding `needs-human`, log the disagreement to `disagreement.md`, **skip the fix**, move to next finding. Do NOT escalate to a 3rd arbiter — user explicitly chose option B (no arbiter).

### Step 5.4 — Apply patch (main thread)

The orchestrator (skill in main thread) applies the agreed patch. The user reviews diffs in real time but doesn't gate.

Run a fast verification command after the edit:
- Python: `.venv/bin/python -m py_compile <file>` for syntax + the project's lint command on the changed files
- TS: `bunx tsc --noEmit <file>` or project equivalent
- (project-specific — read CLAUDE.md / package.json / pyproject.toml)

If verification fails:

- **Attempt 2** — re-run rounds 1+2 with a "previous patch broke X — propose a new fix that doesn't break it" prompt. New consensus → apply → verify.
- **Attempt 3** — if still failing, **revert** all edits for this finding (`git checkout HEAD~? -- <files>` or careful manual revert), tag `needs-human`, log the failure mode, move on.

### Step 5.5 — Commit

Per zone, per cycle: collect all successfully applied fixes into a single commit at the end of Phase 5 for that zone.

Commit message format:

```
fix(<zone-slug>): cycle-<N> — <count> fixes (<critical_count> CRITICAL, <high_count> HIGH, ...)

- <severity> <file>:<line> — <type>
- ...

Refs: .claude/bug-cycles/cycle-<N>.md
```

**No push.** User has explicitly stated they handle pushing.

---

## Phase 6 — Cycle report

After all zones finish Phase 5, write `<project>/.claude/bug-cycles/cycle-<N>.md`:

```markdown
# Cycle N — <ISO date> — target: <target>

## Stats
- Zones audited: X
- Findings (post-dedup): Y (CRITICAL: a, HIGH: b, MED: c, LOW: d)
- Validations performed (cycle ≥3 or <3 findings): V
- Hallucinations filtered: H
- Fixes applied: F
- Needs-human: NH
- Consensus rounds avg: R.r

## Per zone

### `app/services/voice/session/`
**Fixed (commit <sha>)**
- [CRITICAL] session.py:1703 — fire-and-forget task — added done_callback per `_rag_warmup_task` pattern. Consensus in 2 rounds.
- ...

**Needs-human**
- [HIGH] session.py:362 — log says "5s" but timeout is 15s. Reviewers disagree on whether to fix the log or the constant. See round logs.

**Hallucinations filtered (cycle ≥3)**
- [MEDIUM] integrations/openai_client.py:45 — flagged "missing await" but bug-validator confirms call site is in a sync wrapper, not reachable in async path.

### `app/services/voice/integrations/`
...

## Diff summary
N files changed · +X / -Y

## Next
- Cycle <N+1> will spawn fresh agents on the same target.
- Termination check: <0 / 1 / 2> consecutive zero-finding cycles so far.
```

Append a one-line entry to `<project>/.claude/bug-cycles/INDEX.md`:

```
- [Cycle N — <date>](cycle-N.md) — F fixes, NH needs-human, H hallucinations filtered
```

---

## Phase 7 — Loop or terminate

### Termination conditions

Exit if any of:

1. **Two consecutive zero-finding cycles** (the goal — clean state confirmed by an independent fresh audit).
2. **Hard cap: 10 cycles**. Filet de sécurité against runaway loops.
3. **Catastrophic verification failure**: 3+ consecutive cycles where >50% of fixes triggered verification failures. Indicates the audit is misfiring or the codebase is in too unstable a state — exit and surface.
4. **Manual interrupt** by the user (`Ctrl+C` style).

If terminating, write `<project>/.claude/bug-cycles/SUMMARY.md`:

```markdown
# Bug-killer-loop summary — target <target> — <ISO range>

- Total cycles run: N
- Total fixes applied: F (across N cycles)
- Total commits: C (one per zone per cycle, on branch `bug-killer/...`)
- Needs-human: NH (listed below)
- Termination reason: <consecutive zeros | hard cap | catastrophic | interrupt>

## Needs-human queue
<list every finding that ended in `needs-human`, with cycle / zone / round-by-round disagreement>

## Recommended next steps
1. Review the needs-human queue — these need a senior call.
2. Run the project's full test suite (the loop only ran fast verification per fix).
3. Push the branch when satisfied.
```

### If continuing

- Increment cycle index.
- **Spawn entirely fresh audit agents** (no context from prior cycles — this is essential, prevents echo chamber).
- Return to Phase 1 (re-decompose — the codebase has changed, zone boundaries may shift).

---

## Per-fix verification matrix

Different languages need different fast checks. The skill picks based on the project:

| Project signal | Fast check |
|---|---|
| `pyproject.toml` / `requirements.txt` | `python -m py_compile <file>` + project's lint (ruff/black) on the file |
| `package.json` with `"type": "module"` and `tsconfig.json` | `bunx tsc --noEmit <file>` (or `npx tsc`) + eslint on the file |
| Bun project (per CLAUDE.md) | `bunx tsc --noEmit <file>` + `bun test --watch=false <related-test-file>` |
| Go | `go vet <file>` + `go build ./...` |

**Never** run the full test suite per-fix — too slow. Save full-suite verification for Phase 7's termination summary.

---

## Concurrency & file-locking

- **Across zones**: parallel up to 10 zones in fix-mode at once.
- **Within a zone**: serial fixes, critical-first.
- **Shared files**: if two zones in flight both want to edit `<shared.py>`, the orchestrator detects this (track `target_files` per zone fix) and **serializes** those zones — they go one after another. No concurrent edits to the same file.

---

## Anti-patterns this skill prevents

1. **Echo chamber across cycles** — fresh agents per cycle.
2. **Hallucination-driven fixes** — `bug-validator` from cycle 3.
3. **Single-reviewer false positives** — every fix is consensus.
4. **Catastrophic auto-edits** — per-fix verification + 2-attempt limit then revert + needs-human.
5. **Lost work on disagreement** — every disagreement is logged to `round-*.md` for human review.
6. **Untested fixes shipped together** — 1 commit per (zone, cycle); fast verification per fix.
7. **Runaway loops** — hard cap at 10 cycles.

---

## Output artefacts

```
<project>/.claude/bug-cycles/
├── INDEX.md                         # one-line per cycle, latest first
├── baseline.md                      # initial build/test status before cycle 1
├── zones-cycle-1.md                 # zone manifest per cycle
├── zones-cycle-2.md
├── ...
├── cycle-1.md                       # human + AI readable per-cycle report
├── cycle-2.md
├── ...
├── cycle-1/                         # raw artefacts per cycle (for audit / replay)
│   ├── findings.md                  # canonical post-dedup list
│   ├── zone-1/
│   │   ├── hunter.md                # silent-failure-hunter raw output
│   │   ├── reviewer.md              # code-reviewer raw output
│   │   ├── finding-1/
│   │   │   ├── round-1-propose.md
│   │   │   ├── round-2-review.md
│   │   │   ├── ...
│   │   │   └── disagreement.md      # only if needs-human
│   │   └── ...
│   └── ...
└── SUMMARY.md                       # written at termination
```

These artefacts are **AI-readable on purpose** — a future Claude session investigating a regression can load `bug-cycles/cycle-N.md` to know exactly what was changed and why.

---

## Related tools

- `silent-failure-hunter` agent — used in audit + debate (existing)
- `code-reviewer` agent — used in audit + debate (existing)
- `bug-validator` agent — used in Phase 4 (anti-hallucination) — **new, created with this skill**
- `code-explorer` agent — fallback for flat-structure zone decomposition
- `verification-loop` skill — run after termination for full repo gates
- `feature-retirement` skill — different concern (intentional removal)
- `/bug-killer-loop` — slash wrapper for this skill
