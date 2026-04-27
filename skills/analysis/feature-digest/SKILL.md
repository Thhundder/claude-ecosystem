---
name: feature-digest
description: "Use to generate a precise, dense, AI-optimized markdown digest of a code feature/module — entry points, file:line refs, data flow, public API, invariants, side effects, dependencies, gotchas — so future Claude sessions can load the digest instead of re-reading hundreds of lines of source. TRIGGER: 'résume cette feature', 'crée un digest', 'feature memo', 'context fragment', 'summarize this module for AI', 'compact summary of', 'docs ai for X', 'generate a summary .md', 'so AI doesn't have to read all the code'. SKIP: full-repo onboarding (use codebase-onboarding), throwaway exploration without persistence (use explore), human-facing tutorial/walkthrough docs, code review (use code-reviewer agent), public API reference docs (use documentation-lookup / Context7)."
origin: ECC
---

# Feature Digest

Generate a **dense, AI-optimized markdown digest** of a specific code feature, module, or subsystem so that future Claude sessions can load the digest *in lieu of* re-reading the underlying source. The digest is written for machine consumption — not human prose. Token-efficient. Every claim anchored to `path:line`. No filler.

The digest lives at `<project>/.claude/digests/<feature-slug>.md` and is regenerable.

## When to use

- The user points at a feature/module/subsystem and says: "résume ça", "fais un digest", "summary for AI", "context fragment so I don't reload all the code".
- A feature spans many files (≥3) and re-reading them costs significant tokens every session.
- The user wants persistent context that survives across sessions, complementary to `CLAUDE.md` but **scoped to one feature**.

## When NOT to use

- Whole-repo onboarding → `codebase-onboarding`.
- Quick one-shot question → `explore`.
- Code-quality / security review → `code-reviewer`, `security-reviewer`.
- Library API documentation → `documentation-lookup` (Context7).
- Human tutorial / blog-style walkthrough — this skill produces compact reference, not narrative.

## Output contract

A single markdown file at `<project>/.claude/digests/<slug>.md` containing the sections below, in this exact order. **Hard ceiling: 250 lines.** If the feature is too large, split into multiple digests linked from an index file.

### Required frontmatter

```markdown
---
feature: <human name>
slug: <kebab-slug>
generated: <ISO date>
sources:
  - path: <relative/path/to/file.py>
    sha: <git rev-parse HEAD:relative/path/to/file.py>
  - path: <...>
    sha: <...>
entry_points:
  - <function or HTTP route or CLI command>
out_of_scope:
  - <what this digest deliberately does NOT cover>
regenerate_when:
  - <relative path glob whose change should invalidate the digest>
---
```

### Required sections (in order)

1. **Overview** — 2–4 sentences. What the feature does, why it exists, who calls it.
2. **Entry points** — bullet list, each `name → path:line — one-line role`. Cover every external trigger (HTTP route, webhook, CLI, scheduled job, message handler, public function).
3. **Data flow** — a numbered ordered list, ≤12 steps, of what happens from entry to exit. Each step ends with a `path:line` anchor. Include async boundaries explicitly (`→ awaits`, `→ enqueues to`).
4. **Files** — markdown table: `| path | role | key symbols |`. Every file the feature actually depends on. Sort by importance.
5. **Public API / contracts** — function signatures, payload schemas, event names, env vars consumed. Use code blocks with the original language. Include only what other code can call/depend on.
6. **State & side effects** — what the feature mutates: DB tables/collections, files, queues, external APIs, in-memory caches, env. One bullet each, with `path:line` of the mutation site.
7. **Invariants & assumptions** — non-obvious truths the code relies on. Examples: "queue is bounded at 64", "lock must be held before X", "token expires after 50min so refresh at 45". One bullet each, with `path:line` if it's enforced in code.
8. **Concurrency & ordering** — locks, idempotency keys, single-flight patterns, ordering guarantees, retry semantics. Skip if the feature is purely synchronous and stateless.
9. **External dependencies** — internal modules imported, external libraries, third-party APIs (with endpoints), DB collections. Bullets, no prose.
10. **Failure modes** — what can break, what the code does about it (retries / fallbacks / propagates), and what is silently swallowed (flag these explicitly).
11. **Gotchas** — non-obvious traps for the next reader. Bug history, weird workarounds, subtle ordering, anti-patterns the code intentionally avoids. Cite `path:line` for the workaround.
12. **Glossary** — domain terms that appear in the code without context. Skip if none.

## Style rules (machine-readable)

- **Anchor everything**: every factual claim ends with `path:line` (e.g. `app/services/voice/session.py:142`). No anchor → drop the claim.
- **Stable identifiers > paraphrases**: write the actual function/class/route name, never "the handler that does X".
- **Tables over prose** wherever a table fits.
- **No marketing**, no "this elegant solution", no "as you can see". Strip all narrative tone.
- **No XML tags, no emojis** in the body.
- **Code excerpts ≤ 8 lines**, only when a signature/schema is the most precise way to express the contract.
- **Explicit out-of-scope**: list what the digest deliberately omits, so future readers know not to trust it for those questions.
- **Unknowns are tagged**: if you couldn't determine something, write `UNKNOWN: <question>` rather than guessing.

## Procedure

### Phase 1 — Scope the feature

Ask the user (if not already specified):
- Which feature / module / file paths? (accept globs, function names, route prefixes, or "the X flow")
- Any explicit out-of-scope?
- Where to write: default `<project>/.claude/digests/<slug>.md`, override on request.

If the scope is fuzzy, run a quick `grep`/`Glob` pass and propose a concrete file list back to the user before generating.

### Phase 2 — Map the surface

Without reading file bodies yet:
1. Run `Glob` for the candidate paths.
2. Run `Grep` for entry-point patterns: HTTP route decorators, CLI registration, websocket handlers, message subscribers, `__main__`, public exports.
3. Build the **Files** table skeleton from filesystem layout.

If the surface explodes (>20 files), stop and ask the user to narrow scope before continuing.

### Phase 3 — Trace the data flow

For each entry point, follow execution into the implementation files. Read **only the functions on the path**, not whole files. Record:
- Each significant call site → `path:line`
- Mutations (writes, sends, enqueues, kills, spawns)
- Awaits / blocking boundaries
- Branch points (early returns, error paths)

Use the `code-explorer` subagent for this step when the feature spans >5 files — it parallelizes the trace.

### Phase 4 — Extract invariants & gotchas

Re-read with adversarial intent:
- What assumptions would break this code? (timing, ordering, size, encoding)
- What looks like a workaround? Search nearby comments and `git log -L` history if a comment hints at a past bug.
- What errors are caught and swallowed? Flag every `except: pass`, empty catch, or fallback that hides failure.

### Phase 5 — Write the digest

Open the digest file and fill the 12 sections in order. Enforce the style rules. **Trim aggressively** — if a sentence has no `path:line` anchor and no information density, delete it.

After writing, do a self-check pass:
- [ ] ≤ 250 lines total?
- [ ] Every claim anchored?
- [ ] All 12 required sections present (or explicitly marked "N/A — <reason>")?
- [ ] Frontmatter `sources[].sha` populated via `git rev-parse HEAD:<path>` for every cited file?
- [ ] `regenerate_when` covers every cited file (globs OK)?
- [ ] No prose filler, no emojis, no XML, no narrative tone?

If any check fails, fix before reporting done.

### Phase 6 — Register the digest

Update `<project>/.claude/digests/INDEX.md` (create if missing). One line per digest:

```markdown
- [<feature>](<slug>.md) — <one-line hook from Overview>
```

Tell the user the digest path and remind them: future sessions can load it instead of re-reading the source.

## Regeneration

When the user (or an automated check) detects that any path in `regenerate_when` has changed since the recorded `sha`, the digest is **stale**. Re-run this skill on the same feature; the output overwrites the previous file. Don't try to "patch" a stale digest — re-derive it from current source.

## Anti-patterns

- ❌ Paraphrasing code into prose ("first it validates, then it processes…") — write `path:line` references and let the reader jump.
- ❌ Including human-friendly intro sections ("This document explains…").
- ❌ Copy-pasting whole functions into the digest. The digest *replaces* re-reading, but for trivial questions only — deep questions should still drop into source.
- ❌ Generating a digest the user didn't ask for after every feature implementation. This is a deliberate, scoped tool, not a default afterthought.
- ❌ Skipping the `sources[].sha` frontmatter — without it, staleness can't be detected.

## Related tools

- `codebase-onboarding` — when the scope is the whole repo, not one feature.
- `code-explorer` agent — internal helper for Phase 3 when the surface is large.
- `explore` — when the user wants a one-shot answer, not a persistent artifact.
- `context-budget` — to audit how many digests are being loaded into context and prune.
