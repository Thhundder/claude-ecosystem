# Security Rules

## Mandatory Pre-Commit Checklist

Before ANY commit to a shared branch:

- [ ] No hardcoded secrets (API keys, passwords, tokens, database URLs)
- [ ] All user inputs validated at boundaries
- [ ] SQL/NoSQL injection prevented via parameterized queries or ORM
- [ ] XSS prevented (escape user content in HTML, no `dangerouslySetInnerHTML`)
- [ ] CSRF tokens on state-changing endpoints
- [ ] Authentication and authorization verified on every protected route
- [ ] Rate limiting on public endpoints and auth endpoints
- [ ] Error messages don't leak stack traces, file paths, or internal config

## Secret Management

- **Never** hardcode secrets in source code.
- Load from environment variables or a secret manager. Validate they exist at startup and fail loudly if not.
- If a secret might have been exposed (committed, logged, pasted into a chat), rotate immediately.
- Add `.env*` and credential files to `.gitignore`.

```python
# Python — validate at startup
import os
TELNYX_API_KEY = os.environ.get("TELNYX_API_KEY")
if not TELNYX_API_KEY:
    raise RuntimeError("TELNYX_API_KEY is not set")
```

```typescript
// TS — validate at startup
const openaiKey = process.env.OPENAI_API_KEY
if (!openaiKey) throw new Error("OPENAI_API_KEY is not set")
```

## When to Stop and Escalate

If you find or create any of these, **stop and invoke the `security-reviewer` agent**:

- Authentication or authorization code
- User input handling (forms, API bodies, query strings, file uploads)
- Database queries built from user input
- File system operations with user-supplied paths
- External API calls or outbound HTTP
- Cryptographic operations (hashing, signing, encryption)
- Payment, billing, or financial logic
- Voice/SMS/email sending (Telnyx, OpenAI, mail providers)

## Response Protocol for Security Issues

1. **Stop immediately** — don't continue adding features on top of a vulnerability.
2. Use the **security-reviewer** agent for a full audit.
3. Fix CRITICAL issues before continuing any other work.
4. Rotate any exposed secrets.
5. Search the codebase for the same pattern elsewhere — vulnerabilities cluster.

## Log Hygiene

- Never log request bodies, headers, auth tokens, or PII.
- Use structured logging with explicit field allow-lists.
- Redact phone numbers, email addresses, and user content in voice/chat logs by default.
