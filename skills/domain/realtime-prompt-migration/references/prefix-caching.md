# Prompt prefix caching — section ordering for dynamic prompts

When a prompt is **assembled dynamically** (sections injected based on enabled features, runtime context, etc.), the ordering of sections directly determines how much of every API call hits OpenAI's automatic prefix cache.

This reference is **mandatory reading** before restructuring any prompt that is built by code (e.g. a `build_prompt(features, ...)` function), regardless of which model version you target — the cache mechanism is identical for `gpt-realtime`, `gpt-realtime-2`, the chat completions API, and the responses API.

---

## How OpenAI prefix caching actually works

The cache is **byte-prefix based**, not field-based. The server tokenizes your single `instructions` (or `system`) string and walks tokens left-to-right. The longest prefix that matches a recently-seen request gets billed at the cached rate (~10× cheaper). The match stops at the **first differing token** — everything after it is billed full price.

Implications:

1. **There is no `instructions_stable` / `instructions_variable` split** in the API. You send one string. Caching is invisible and automatic.
2. **The first byte that differs ends the cache hit.** A single newline drift, a date, a session ID, or a non-deterministic dict iteration order placed early in the prompt **destroys the entire cache for that call**.
3. **Minimum cacheable prefix: ~1024 tokens for OpenAI input caching** (verified for GPT-4o family; not explicitly documented for `gpt-realtime-2` but appears to use the same threshold empirically). Prompts with a stable prefix shorter than ~1024 tokens get no cache benefit. For voice agents this is rarely a constraint — even minimal v2-ready prompts run 1500–3000 tokens.
4. **TTL: OpenAI does not publicly document the exact cache lifetime for Realtime / Chat Completions input caching.** Empirically, the cache appears to evict within 5–15 minutes of inactivity. Steady traffic keeps the prefix warm; long gaps between calls require a fresh cache write (billed at full input rate, no surcharge unlike Anthropic). Plan for the cache to be a "warm window" optimization, not a long-term store.
5. **Per-organization, per-API-key.** The cache is not shared across orgs.

---

## The ordering rule

For any dynamically assembled prompt:

> **Static content first. Dynamic content last. No exceptions in the static prefix.**

"Static" here means: **byte-identical across every call your service can possibly make**. If the section ever changes by a single character based on features/config/runtime/locale, it is **dynamic**.

Concretely, group sections into two zones in the builder:

```
┌─────────────────────────────────────────┐
│   STATIC PREFIX (cached after warmup)   │
│   - title                               │
│   - instruction priority                │
│   - scope & safety                      │
│   - call recording                      │
│   - unclear audio                       │
│   - personality, length, variety        │
│   - sample phrases                      │
│   - any other section that NEVER varies │
├─────────────────────────────────────────┤
│   DYNAMIC SUFFIX (re-billed each call)  │
│   - role (depends on features)          │
│   - language (depends on lang_lock)     │
│   - source of truth (depends on tools)  │
│   - conversation state block (varies)   │
│   - reservation flow sections           │
│   - tool docs (per active tool)         │
│   - reference pronunciations (varies)   │
│   - runtime context placeholder         │
└─────────────────────────────────────────┘
```

**Within each zone, order is irrelevant for caching.** Only the boundary matters.

---

## Tension réelle entre caching et recency-bias tonality

OpenAI's v2 prompting guide recommends placing personality / tone sections at the END of the prompt to benefit from recency bias on vocal delivery. This conflicts with cache ordering, since these sections are static and should sit in the prefix.

Both effects are real, not theoretical:

- Recency bias on tonality: measurable on sessions > 3 min, especially in voice contexts where prosody drift is audible.
- Cache cost reduction: 10× on input tokens (80× on audio input), immediate ROI from the second call onward.

The recommended resolution is a HYBRID:

1. Place the FULL personality / tone / sample phrases section in the static prefix (cacheable).
2. Append a CONDENSED 2-3 line tonality reminder at the very end of the dynamic suffix, e.g.:

   `Reminder: speak warmly, conversationally, in 2-3 short sentences max. Vary your phrasing across turns.`

The duplication costs ~30 tokens per call (negligible) but preserves both the cache hit and the recency anchor on tone.

If you DON'T do the duplication and put personality only in the prefix, expect measurable tonality drift on sessions > 5 min. Test this on your own use case before deciding.

---

## OpenAI Realtime API pricing impact

For gpt-realtime-2 specifically, the cache ratio is much more favorable than text-only models:

| Token type    | Full rate    | Cached rate    | Ratio |
|---------------|--------------|----------------|-------|
| Audio input   | $32 / 1M     | $0.40 / 1M     | 80×   |
| Text input    | $4 / 1M      | $0.40 / 1M     | 10×   |
| Audio output  | $64 / 1M     | (not cached)   | —     |

The system prompt is text, so the 10× ratio applies to it. On voice agents, the system prompt is typically the LARGEST text input on every call (the conversation grows but each turn adds little text). Caching the system prompt prefix typically reduces total input cost by 60-80%.

Source: https://openai.com/api/pricing/ (verified for gpt-realtime-2 on 2026-05-08 launch).

---

## How caching applies to Realtime API specifically

Realtime API has a unique session model: the system prompt is sent ONCE per WebSocket session via `session.update.session.instructions`. Within a single session, the prompt is not re-sent on every `response.create` — the model already has it loaded.

This means caching plays out between SESSIONS, not within them:

- Each new phone call = new WebSocket = new session.update with instructions.
- If the previous call (same or different caller) used the same static prefix < 5-15 min ago, OpenAI detects the common prefix and bills the matching tokens at the cached rate.
- Active hours (peak booking times) keep the prefix warm. Off-hours pay the full rate on the first call after a gap.

Implication for traffic patterns:

- High-volume voice agents (50+ calls/hour) → near-constant cache hit → maximum savings.
- Low-volume agents (5 calls/day, spaced out) → mostly full-rate writes, minimal cache benefit.
- Bursty traffic (many calls during 12-2pm, few elsewhere) → excellent caching during bursts.

Measure cached_tokens in production over 1 week to know your actual cache hit ratio before optimizing further.

---

## Cache killers (audit list)

These all silently break the cache when placed in the static prefix. Audit the builder for them:

| Killer | Why it breaks cache | Fix |
|---|---|---|
| `f"Today is {date.today()}"` in the prefix | New token every day | Move to runtime context or strip |
| Session ID, call ID, conversation ID, request ID | New token every call | Inject only via runtime context, never in static prefix |
| Campsite/tenant/customer name in the prefix | Token differs per tenant | Move to runtime context block (dynamic suffix), keep prefix tenant-agnostic |
| `", ".join(features)` with non-sorted iteration | Order can vary across Python versions / dict insertion order | Always `sorted(features)` before joining |
| `{user_first_name}` interpolation in the prefix | New token per user | Always inject via runtime context, never in prefix |
| Whitespace drift between code paths (extra `\n`, trailing spaces) | One byte = full cache miss | Snapshot-test the static prefix bytes |
| Markdown list reordering when source set is unordered | Order varies | Sort deterministically before rendering |
| Locale/language injected into the prefix | New variant per locale | Move locale-specific content to dynamic suffix |
| Conditional `if has_X:` toggles inside a section that's otherwise stable | Conditional makes the whole section dynamic | Either move section to dynamic suffix or split into two: stable shell + dynamic addendum at end |

---

## How to verify caching actually works

The Realtime API and Chat Completions both report cached input tokens in the usage payload. Look for `cached_tokens` (or equivalent) in your usage logs.

A healthy cached ratio after a few warm calls:
- **`cached / input` ≥ 60%** for prompts assembled with a large static prefix (> 4 KB) → ordering is correct
- **`cached / input` 20–60%** → cache is partially working but the static-dynamic boundary is too high in the prompt; move more sections up
- **`cached / input` < 20%** after multiple calls → the prefix is not actually stable; audit for cache killers

Use the `cached_tokens` field as a regression metric: if a PR drops your cache hit rate, it has either reordered sections or introduced a cache killer in the prefix.

---

## Snapshot test the static prefix

For any builder, add a unit test that pins the byte content of the static prefix:

```python
def test_static_prefix_is_byte_stable():
    """Whatever is rendered before the first dynamic section must be invariant.
    A failing assertion here means a recent change introduced cache drift.
    Re-snapshot only after confirming the change is intentional and that the
    expected cache hit rate impact is acceptable."""
    rendered = build_prompt(features=set(), pronunciations=(), has_lang_lock=False)
    static_prefix, _ = rendered.split(STATIC_DYNAMIC_BOUNDARY_MARKER, 1)
    expected_hash = "sha256:..."
    assert sha256(static_prefix.encode()).hexdigest() == expected_hash
```

The boundary marker can be a hidden HTML comment (`<!-- DYNAMIC SECTIONS BELOW -->`) emitted by the builder between zones. It costs ~10 tokens but makes the test mechanical.

Alternative implementation: use a zero-width space (`​`) instead of an HTML comment as the boundary marker. The model sees no visible content (the tokenizer typically encodes zero-width spaces as a single negligible token), but the test code can still split on the marker. Cleaner than embedding an HTML comment that the model could theoretically interpret literally — though in practice both approaches work fine.

```python
STATIC_DYNAMIC_BOUNDARY_MARKER = "​"  # zero-width space, invisible to the model
```

---

## Quick checklist for the migration

When restructuring a dynamically-assembled prompt for v2, run this checklist:

- [ ] Builder explicitly groups sections into `STATIC_SECTIONS` and `DYNAMIC_SECTIONS` lists
- [ ] All sections in `STATIC_SECTIONS` are byte-identical across every code path (proven by snapshot test)
- [ ] No date/time/ID/tenant string is interpolated into any static section
- [ ] All set/dict iterations in the prefix use `sorted(...)` for deterministic order
- [ ] `Personality`, `Tone`, `Sample Phrases` are in the static prefix AND a condensed 2-3 line tonality reminder is duplicated at the very end of the dynamic suffix (HYBRID — see "Tension réelle..." section)
- [ ] Tool docs go in the dynamic suffix (different per feature combo)
- [ ] Conversation State Block content goes in the dynamic suffix (varies with feature flags)
- [ ] A unit test asserts the static prefix hash
- [ ] Production logs report `cached_tokens` and a dashboard tracks the cache hit ratio
- [ ] Alert configured: cache_hit_ratio < 50% sustained over 30 min triggers a Slack notification (indicates either a cache killer regression OR traffic dropped below cache-warm threshold)
