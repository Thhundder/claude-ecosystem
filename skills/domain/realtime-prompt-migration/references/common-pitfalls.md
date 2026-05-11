# Common pitfalls in 1.5 → 2 prompt migration

This document lists the migration mistakes most likely to bite you and how to avoid them.

## Pitfall 1: Keeping all hard constraints "to be safe"

**Symptom:** the migrated agent feels rigid, over-confirms, and asks unnecessary questions.

**Root cause:** v2 follows constraint words literally. `always confirm` means **always**, including for trivial read-only lookups.

**Fix:** for every absolute word in the prompt, decide:
- **Keep** if the behavior truly must be rigid (safety, legal, irreversible actions like payments)
- **Scope** to the specific case it was meant for ("Always confirm" → "Confirm before write actions that modify user data")
- **Remove** if redundant or emergent from other instructions

**Anti-pattern:**
```
Always confirm before doing anything.
```

**Fix:**
```
For write actions that modify user data, ask for confirmation 
before calling the tool. For read-only lookups, do not ask for 
confirmation unless the lookup depends on a high-precision 
identifier.
```

---

## Pitfall 2: Adding canonical sections that don't apply

**Symptom:** prompt is bloated with sections that confuse the model.

**Root cause:** treating the canonical section list as a checklist instead of a toolbox.

**Fix:** include only sections that serve the prompt's use case. A simple smart-home agent doesn't need `# Entity Capture`. A pure phone-line FAQ bot doesn't need `# Tools`. A short-session agent doesn't need `# Long Context Behavior`.

**Rule of thumb:** if you can't write the content of a section in 30 seconds from the original prompt's requirements, the section probably doesn't belong.

---

## Pitfall 3: Migrating but not adding preambles

**Symptom:** post-migration, users report "long awkward silences before responses".

**Root cause:** v2 reasons internally before speaking. Without preambles, that reasoning latency manifests as silence.

**Fix:** every prompt that has tool calls MUST have a `# Preambles` section. Even if the original 1.5 prompt didn't have one. This is the single biggest UX win of the migration.

**Minimum viable preamble section (5 lines):**
```
# Preambles
Before calling a tool that takes noticeable time, say one short 
phrase like "Je vérifie tout de suite" or "Un instant, je 
regarde". Keep it natural, vary the wording. Do not use preambles 
for direct answers, unclear audio, or simple confirmations.
```

---

## Pitfall 4: Removing the brand voice repetition prematurely

**Symptom:** the agent drifts off-brand after 10+ turns.

**Root cause:** v2 retains tone better than 1.5, BUT it's not infinite. Stripping all brand voice from a long session prompt can let the agent drift.

**Fix:** keep ONE clear brand voice statement at the top of the prompt. Remove the redundant repetitions but not the source statement.

---

## Pitfall 5: Not updating the client code for phases

**Symptom:** preambles are rendered to the user as if they were the final answer, making the UI confusing.

**Root cause:** v2 emits `response.done` events with `phase: "commentary"` and `phase: "final_answer"`. Client code that ignored the phase field on 1.5 will mix them up on 2.

**Fix:** this is a code change, not a prompt change. The skill flags it because prompt migration is incomplete without it. Update the client to:
- Treat `commentary` phase as intermediate UI (subtle, italic, or status indicator)
- Treat `final_answer` phase as the actual transcript line

---

## Pitfall 6: Not relaxing the context compactor

**Symptom:** the agent still loses context on long sessions after migration.

**Root cause:** if a custom compactor was built for the 32k window, it may still be aggressively dropping items even though the v2 window is 128k.

**Fix:** evaluate which compactor jobs are still needed. Don't blindly disable it (often the compactor does more than just compaction — language locking, entity tracking, state injection). Measure context usage on real sessions before relaxing.

---

## Pitfall 7: Migrating prompt and model in the same PR

**Symptom:** if a regression appears, impossible to bisect whether it came from the model bump or the prompt restructure.

**Root cause:** mixing two variables in one change.

**Fix:** sequence the work:
1. PR 1: technical migration (protocol GA + model bump + minimal preambles section only)
2. PR 2: full prompt restructure (everything else from this skill)

Test each PR independently with the same canary scenarios.

---

## Pitfall 8: Not running canary tests before/after

**Symptom:** subtle behavioral regressions discovered weeks after migration in production.

**Root cause:** no baseline to compare against.

**Fix:** before applying the migrated prompt, capture 10-15 representative conversation scenarios. After migration, rerun the same scenarios. Compare:
- Tool calls made (same set? extra ones? missing ones?)
- Confirmation requests (more? fewer?)
- Preamble emissions (present when expected?)
- Response latency (TTFA before vs after)
- Brand voice consistency

A migration that "looks better on paper" but fails canary tests is not ready.

---

## Pitfall 9: Adding `wait_for_user` tool without prompt rules

**Symptom:** the agent doesn't use the tool, still responds to noise.

**Root cause:** declaring a tool doesn't tell the model when to call it.

**Fix:** if you add `wait_for_user` to the tool list, also add a `# Handling Silence and Background Noise` section in the prompt that explicitly tells the model when to call it.

```
# Handling Silence and Background Noise
If the latest audio is silence, background noise, hold music, TV 
audio, side conversation, or speech not addressed to you, call 
wait_for_user.
Do not respond conversationally after calling this tool.
Resume normal responses only when the user clearly addresses you.
```

---

## Pitfall 10: Tool name drift between prompt and tool list

**Symptom:** the agent invents tool names or simulates actions.

**Root cause:** the prompt refers to `lookup_order` but the tool list registers `search_orders`. v2 is eager to help and may invent the name.

**Fix:** during migration, do a strict cross-check. Every tool mentioned in the prompt must exist in the tool list with the EXACT name. Every tool in the list should be referenced in the prompt (with usage rules), or removed if unused.

---

## Pitfall 11: Dynamic content interleaved with static in the prompt builder

**Symptom:** input-token cost stays high after migration even though the prompt is mostly stable across calls. `cached_tokens` in usage logs is < 20% of `input_tokens`.

**Root cause:** the prompt is assembled by a `build_prompt(features, ...)` function that emits sections in a logical order (e.g. role → context → tools → personality), interleaving stable sections with feature-dependent ones. OpenAI's automatic prefix cache ends at the **first** differing token, so a single feature-dependent section near the top wastes the entire stable suffix that follows.

**Fix:** restructure the builder so it emits ALL byte-stable sections first (the static prefix), then emits ALL feature/runtime-dependent sections (the dynamic suffix). Within each zone the order is irrelevant for caching. Pin the static prefix bytes with a snapshot test so future PRs can't silently regress the cache rate.

**Anti-pattern:**
```python
sections = [
    title,                          # static
    role(features),                 # DYNAMIC — kills cache here
    runtime_context,                # static (now uncached)
    language(has_lang_lock),        # dynamic
    scope_and_safety,               # static (uncached)
    tools(features),                # dynamic
    personality_and_tone,           # static (uncached) — supposed to live here for "recency"
]
return "\n\n".join(sections)
```

**Fix:**
```python
STATIC_SECTIONS = [
    title,
    instruction_priority,
    runtime_context,
    scope_and_safety,
    call_recording,
    unclear_audio,
    personality_and_tone,
    length_and_pacing,
    variety,
    sample_phrases,
]
DYNAMIC_SECTIONS = [
    role(features),
    language(has_lang_lock),
    source_of_truth(features),
    conversation_state_block(features),
    reservation_sections(features),
    tools(features),
    reference_pronunciations(pronunciations),
]
return (
    "\n\n".join(STATIC_SECTIONS)
    + "\n\n<!-- DYNAMIC SECTIONS BELOW -->\n\n"
    + "\n\n".join(DYNAMIC_SECTIONS)
)
```

The cost: personality moves from the end (where v2 likes it for recency-bias tonality) to the static prefix at the top. In practice the recency effect on tone is marginal compared to a 10× input-cost reduction. If the tonality drift is genuinely measurable, duplicate one personality reminder line at the very end of the dynamic suffix — the duplication is a few tokens, the prefix stays cacheable.

See `references/prefix-caching.md` for the full mechanism, killer audit list, snapshot-test pattern, and cached-ratio targets.
