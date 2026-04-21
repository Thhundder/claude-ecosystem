# Voice AI over Telephony — Best Practices

Specific to voice agents running over Telnyx (Call Control API) + OpenAI Realtime API, as used in the Xeko stack. Principles generalize to Twilio, Vapi, LiveKit, Pipecat, etc.

## Architecture Discipline

- **Separate call control from conversation logic.** The Telnyx side handles `answer`, `hangup`, `streaming_start`, `record_start`. The LLM side handles dialogue. They talk through a well-defined interface, not a tangled monolith.
- **WebSocket relay in the middle.** One bidirectional WS between Telnyx media and your FastAPI, another between FastAPI and OpenAI Realtime. Don't skip the relay — you need it for backpressure, reconnect, and observation.
- **PCMU 8kHz is the telephony format** for Telnyx media streaming. OpenAI Realtime expects a specific format too — convert at the boundary, not in random middleware.

## Latency-First

Everything in a voice agent is a latency budget. Aim for **<800ms total** from end of user speech to start of agent audio.

- Stream audio as soon as the first tokens are available. Don't wait for a full response.
- Use **partial transcripts** from the provider, not sentence-boundary transcripts.
- **Warm your connections** — open WS to the LLM before the call answers, not after.
- **No synchronous DB reads on the hot path.** Cache at startup, refresh in the background.
- **Time every hop** in logs (call → media start → first token → first audio out). Regression hunts depend on it.

## Cost Controls

Voice sessions get expensive fast. OpenAI Realtime bills on both input and output audio minutes.

- **Hard cap session duration.** Kill the call after N minutes even if the user is still talking.
- **Cap silence** — hang up after M seconds of mutual silence.
- **Monitor cost per call in real time** via the Telnyx `call_cost_in_webhooks` flag on your Call Control Application.
- **Budget alarms**: per-day and per-call.
- Use the `cost-aware-llm-pipeline` skill for patterns.

## Robustness

- **Every external call gets a timeout.** Telnyx API, OpenAI WS, DB, MCP calls — all of them.
- **Retry with backoff** on provider errors, but cap total retry budget per call.
- **Circuit breaker on the LLM provider.** If OpenAI is degraded, fall back to a canned message + human handoff rather than failing silently.
- **Graceful disconnects**. If the WS to OpenAI drops mid-call, play a short reassuring message and attempt one reconnect. Don't leave the caller in silence.
- **Every voice function / tool call must be idempotent** — the LLM can and will retry.

## Testing Voice Agents

Integration tests here are mandatory. Unit tests on your prompt logic are necessary but not sufficient.

- **Recorded session replay** — capture real call transcripts + media, replay them through your pipeline in CI.
- **Golden path smoke test** — one scripted caller hitting a real Telnyx number end-to-end on a daily cron.
- **Adversarial tests** — silence, long pauses, interruption, DTMF presses, background noise, non-target languages.
- **Measure, don't vibe-check.** Track first-token latency, tool-call rate, mean session length, fallback rate, cost per call.
- Use `eval-harness` + `agent-eval` skills for structured evaluation.

## Security for Voice

- Never log raw audio, transcripts, or tool arguments by default. Redact phone numbers, emails, and any PII.
- If recording calls (Telnyx `record_start`), handle storage and retention explicitly. Legal requirements vary by jurisdiction — in the EU, caller consent is often required.
- Protect webhook endpoints with Telnyx signature verification. Reject unsigned or expired webhooks.
- Rate-limit inbound unknown-number traffic to protect against toll fraud and flooding.

## Relevant Skills and Agents

- `telnyx-voice-python` — Call Control API
- `telnyx-voice-streaming-python` — bidirectional WS streaming
- `telnyx-voice-advanced-python` — SIPREC, DTMF, noise suppression
- `telnyx-messaging-python` — outbound SMS from call flows
- `cost-aware-llm-pipeline` — cost patterns
- `continuous-agent-loop` — durable agent loops
- `verification-loop` — multi-layer verification
- `silent-failure-hunter` agent — hunt for quiet regressions
