# What changed from gpt-realtime-1.5 to gpt-realtime-2

This document lists the behavioral and structural changes you need to account for when migrating a prompt.

## Behavioral changes

### 1. Literal instruction following

**v1.5:** forgiving with vague instructions. "Be helpful" worked. "Always confirm" was interpreted as "confirm when it makes sense".

**v2:** applies the letter of instructions, not the spirit. "Always confirm" means **always**, including for trivial read-only lookups. "Be helpful" produces inconsistent behavior because "helpful" is not defined.

**Migration implication:** every absolute word in the prompt (`always`, `never`, `must`, `only`, `forbidden`) must be audited. Either softened with explicit scope, or kept because the constraint truly must be rigid.

### 2. Reasoning is native

**v1.5:** non-reasoning. Responded immediately based on the prompt.

**v2:** reasons internally before speaking. This can produce 500-2000ms of silence before the first audio chunk, depending on `reasoning.effort`. Even at `minimal`, ~50-100 tokens of reasoning happen by default.

**Migration implication:** prompts must include a `# Preambles` section so the model speaks a short filler ("I'll check that now") while reasoning. Otherwise the user hears silence.

### 3. Two response phases

**v1.5:** a single response stream per turn.

**v2:** can emit a `commentary` phase (preambles, tool narration) and a `final_answer` phase, both visible to the user. Each `response.done` event has a `phase` field.

**Migration implication:** prompts can now distinguish behavior across phases. For example, preambles always go in `commentary`, final user-facing replies in `final_answer`. The client code must also handle the phase distinction.

### 4. Tool eagerness is per-tool

**v1.5:** global tool-calling behavior. You either had eager calling or conservative.

**v2:** each tool can be classified as PROACTIVE (call when intent clear), CONFIRMATION-FIRST (always confirm before calling), or PREAMBLE-FIRST (speak short filler before calling).

**Migration implication:** prompts should classify tools individually. Read-only lookups → PROACTIVE. Writes/payments/cancellations → CONFIRMATION-FIRST. Slow read-only ops → PREAMBLE-FIRST.

### 5. Parallel tool calls

**v1.5:** tools called sequentially.

**v2:** can fire 2-3 tools in parallel and narrate progress.

**Migration implication:** if the prompt has chains of tools that don't depend on each other (e.g., `check_balance` + `list_transactions`), the prompt can encourage parallel calls. Otherwise no change needed.

### 6. Recovery behavior

**v1.5:** on tool failure or ambiguous input, the model either looped, hallucinated, or went silent.

**v2:** can handle failures gracefully if given fallback instructions. Without them, it can over-confirm or over-clarify.

**Migration implication:** prompts should include explicit recovery rules: what to do on tool failure, what to do on unclear audio, what to do on partial input.

### 7. Domain tone retention

**v1.5:** required repeating brand voice and tone rules across the prompt.

**v2:** retains specialized terminology, brand voice, and adapts delivery across a long session naturally.

**Migration implication:** redundant brand voice repetition can be removed, freeing prompt budget for v2-specific sections.

## Structural changes

### Context window: 32k → 128k tokens

Prompts can be longer. Long-session sessions (banking calls, tutoring, support) work without context drift. But audio still tokenizes at ~50 tokens/second, so a 1h call burns context fast.

**Migration implication:** if the prompt was aggressively compacted to fit 32k, it can be relaxed. If a context compactor exists, evaluate whether some of its jobs are redundant with the larger window.

### Image input (new)

`gpt-realtime-2` accepts images in user turns. Useful for voice-driven QA on UI screenshots, field support with photos, accessibility.

**Migration implication:** none unless the use case explicitly involves vision. Don't add image handling instructions blindly.

### MCP servers native

The Realtime API can now execute MCP server calls server-side without round-tripping through your function-call event loop.

**Migration implication:** if the prompt orchestrates many tools, consider migrating to MCP server tools instead of function tools. Out of scope for prompt migration itself, but worth noting.

## Classic bugs introduced by 1.5 → 2 without prompt changes

These are the symptoms you'll see if you bump the model without updating the prompt:

| Symptom | Root cause | Fix |
|---|---|---|
| Agent confirms every action, even reads | Hard constraint `always confirm` | Scope to write actions only |
| 2-second silences before responses | No preambles section | Add `# Preambles` section |
| Agent switches language on accent | No language locking | Add `# Language` section with strict rules |
| Agent misreads order IDs / phone numbers | No entity capture rules | Add `# Entity Capture` section |
| Agent calls tools with wrong identifiers | No confirm-before-tool rule | Add identifier confirmation step |
| Agent reacts to TV / background noise | No `wait_for_user` tool or unclear audio rules | Add tool + `# Unclear Audio` section |
| Agent goes silent on tool failures | No recovery instructions | Add tool failure handling rules |
| Agent loops on the same clarification | No "don't repeat clarification" rule | Add explicit non-repetition rule |
| Agent over-eager to call tools | Vague tool descriptions | Specify "use when..." and "do NOT use when..." per tool |
