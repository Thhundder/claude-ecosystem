# Prompt prefix caching — section ordering for dynamic prompts

When a prompt is **assembled dynamically** (sections injected based on enabled features, runtime context, etc.), the ordering of sections directly determines how much of every API call hits OpenAI's automatic prefix cache.

This reference is **mandatory reading** before restructuring any prompt that is built by code (e.g. a `build_prompt(features, ...)` function), regardless of which model version you target — the cache mechanism is identical for `gpt-realtime`, `gpt-realtime-2`, the chat completions API, and the responses API.

---

## How OpenAI prefix caching actually works

The cache is **byte-prefix based**, not field-based. The server tokenizes your single `instructions` (or `system`) string and walks tokens left-to-right. The longest prefix that matches a recently-seen request gets billed at the cached rate (~10× cheaper). The match stops at the **first differing token** — everything after it is billed full price.

Implications:

1. **There is no `instructions_stable` / `instructions_variable` split** in the API. You send one string. Caching is invisible and automatic.
2. **The first byte that differs ends the cache hit.** A single newline drift, a date, a session ID, or a non-deterministic dict iteration order placed early in the prompt **destroys the entire cache for that call**.
3. **Minimum cacheable prefix is ~1024 tokens** (provider-defined threshold). Shorter prompts get no cache benefit.
4. **TTL ~1 hour** since the last hit. Steady traffic keeps the cache warm; sporadic calls don't.
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

## Tension with v2 "personality at end for recency"

The v2 prompting guide commonly recommends placing **personality / tone / sample phrases at the end** of the prompt for recency bias on tonality. This conflicts with cache ordering when those static sections sit *after* dynamic sections.

**Resolution:**

- For prompts assembled dynamically and called at scale, **caching wins**. Move personality/tone/style to the static prefix at the top. The recency bias on tonality is a marginal effect; the cost saving on input tokens is 10× and measurable.
- For one-shot prompts (single call, no dynamic axes), recency ordering is fine — there is nothing to cache.
- If you genuinely need recency-bias personality AND have a cached dynamic prompt, **duplicate** the personality reminder as a single line at the very end of the dynamic suffix. The duplication costs a few tokens; the prefix stays cacheable.

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

---

## Quick checklist for the migration

When restructuring a dynamically-assembled prompt for v2, run this checklist:

- [ ] Builder explicitly groups sections into `STATIC_SECTIONS` and `DYNAMIC_SECTIONS` lists
- [ ] All sections in `STATIC_SECTIONS` are byte-identical across every code path (proven by snapshot test)
- [ ] No date/time/ID/tenant string is interpolated into any static section
- [ ] All set/dict iterations in the prefix use `sorted(...)` for deterministic order
- [ ] `Personality`, `Tone`, `Sample Phrases` are in the static prefix (with optional 1-line recency reminder at the very end of the dynamic suffix)
- [ ] Tool docs go in the dynamic suffix (different per feature combo)
- [ ] Conversation State Block content goes in the dynamic suffix (varies with feature flags)
- [ ] A unit test asserts the static prefix hash
- [ ] Production logs report `cached_tokens` and a dashboard tracks the cache hit ratio
