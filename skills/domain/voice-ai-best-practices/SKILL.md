---
name: voice-ai-best-practices
description: "Use when building, debugging, or reviewing voice agents over telephony — call control + realtime LLM, latency budgets, cost caps, robustness, PCMU streaming. TRIGGER: 'voice agent', 'call control', 'realtime API', PCMU/PCMA, WebSocket audio streaming, Telnyx/Twilio/Vapi/LiveKit/Pipecat, voice latency tuning, STT/TTS pipeline. SKIP: plain chatbot work, messaging-only flows, non-voice AI projects, static audio file processing."
origin: ECC
---

# Voice AI over Telephony — Best Practices

Principles for voice agents that answer or place phone calls, independent of provider stack. Examples cite Telnyx + OpenAI Realtime but generalize to Twilio, Vapi, LiveKit, Pipecat, and similar.

## Architecture Discipline

- **Separate call control from conversation logic.** The telephony side handles `answer`, `hangup`, `streaming_start`, `record_start`. The LLM side handles dialogue. They talk through a well-defined interface, not a tangled monolith.
- **WebSocket relay in the middle.** One bidirectional WS between telephony media and your backend, another between backend and the realtime LLM. Don't skip the relay — you need it for backpressure, reconnect, and observation.
- **PCMU 8kHz is the telephony format** for most carrier streams. Realtime LLM APIs expect their own format — convert at the boundary, not in random middleware.

## Latency-First

Everything in a voice agent is a latency budget. Aim for **<800ms total** from end of user speech to start of agent audio.

- Stream audio as soon as the first tokens are available. Don't wait for a full response.
- Use **partial transcripts** from the provider, not sentence-boundary transcripts.
- **Warm your connections** — open WS to the LLM before the call answers, not after.
- **No synchronous DB reads on the hot path.** Cache at startup, refresh in the background.
- **Time every hop** in logs (call → media start → first token → first audio out). Regression hunts depend on it.

## Cost Controls

Voice sessions get expensive fast. Realtime APIs bill on both input and output audio minutes.

- **Hard cap session duration.** Kill the call after N minutes even if the user is still talking.
- **Cap silence** — hang up after M seconds of mutual silence.
- **Monitor cost per call in real time** via the provider's webhook cost flag.
- **Budget alarms**: per-day and per-call.
- Use the `cost-aware-llm-pipeline` skill for model routing and caching patterns.

## Robustness

- **Every external call gets a timeout.** Telephony API, LLM WS, DB, MCP calls — all of them.
- **Retry with backoff** on provider errors, but cap total retry budget per call.
- **Circuit breaker on the LLM provider.** If the provider is degraded, fall back to a canned message + human handoff rather than failing silently.
- **Graceful disconnects**. If the WS to the LLM drops mid-call, play a short reassuring message and attempt one reconnect. Don't leave the caller in silence.
- **Every voice function / tool call must be idempotent** — the LLM can and will retry.

## Testing Voice Agents

Integration tests here are mandatory. Unit tests on your prompt logic are necessary but not sufficient.

- **Recorded session replay** — capture real call transcripts + media, replay them through your pipeline in CI.
- **Golden path smoke test** — one scripted caller hitting a real phone number end-to-end on a daily cron.
- **Adversarial tests** — silence, long pauses, interruption, DTMF presses, background noise, non-target languages.
- **Measure, don't vibe-check.** Track first-token latency, tool-call rate, mean session length, fallback rate, cost per call.
- Use the `eval-harness` skill for structured evaluation of your voice agent.

## Security for Voice

- Never log raw audio, transcripts, or tool arguments by default. Redact phone numbers, emails, and any PII.
- If recording calls, handle storage and retention explicitly. Legal requirements vary by jurisdiction — in the EU, caller consent is often required.
- Protect webhook endpoints with provider signature verification. Reject unsigned or expired webhooks.
- Rate-limit inbound unknown-number traffic to protect against toll fraud and flooding.

## Relevant Skills and Agents

- `telnyx-voice-python` — Call Control API (Telnyx-specific reference)
- `telnyx-voice-streaming-python` — bidirectional WS streaming
- `telnyx-voice-advanced-python` — SIPREC, DTMF, noise suppression
- `telnyx-messaging-python` — outbound SMS from call flows
- `cost-aware-llm-pipeline` — cost patterns
- `continuous-agent-loop` — durable agent loops
- `silent-failure-hunter` agent — hunt for quiet regressions
- `verification-loop` — multi-layer verification
