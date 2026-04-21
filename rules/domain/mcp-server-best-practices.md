# MCP Server Best Practices

For building MCP (Model Context Protocol) servers that plug into Claude Code, Cursor, or any MCP-compatible host.

## Transport Choice

- **stdio** for local process servers that the host spawns. Simplest. Use for per-project tooling and CLI-like integrations.
- **Streamable HTTP** for remote or shared servers. Use for team-wide tooling, cloud services, and anything where multiple clients talk to the same backend.
- **Don't use both** for the same server without a reason — pick one per deployment.

## Tools, Resources, Prompts — Know the Difference

MCP gives you three primitive types. They're not interchangeable.

| Type | Purpose | When to Use |
|------|---------|-------------|
| **Tool** | Function the LLM can invoke with arguments, with side effects | Creating/updating state, fetching data, running computation |
| **Resource** | Read-only URI-addressable content the host can fetch | Documents, files, cached data the LLM may reference |
| **Prompt** | Reusable parameterized prompt template the user can invoke | Slash-command-like workflows |

Rule of thumb: if the LLM needs to **decide to call it** based on context, it's a tool. If the host needs to **attach it to the context** directly, it's a resource.

## Tool Design

- **Name tools by verb-noun** in the imperative: `search_customers`, `create_invoice`, not `customer_search` or `customers`.
- **Descriptions teach the LLM when to call it.** Spend time on the description — it's how the LLM knows whether your tool is the right one.
- **Schema every argument with Zod / Pydantic.** Required vs optional, types, bounds, enums. Never accept free-form strings where a constrained value will do.
- **Return structured results**, not prose. JSON-serializable, with explicit fields. The LLM can summarize; your tool shouldn't.
- **Keep tools focused.** One tool per action. Don't build a god-tool with a `command` argument that branches internally.
- **Return errors as structured errors**, not exceptions that surface as generic "MCP error." Give the LLM enough context to retry intelligently.

## Observation Formatting

The LLM reads your tool output — design it to be readable.

- **Concise structured output beats verbose prose.** Tables, lists, YAML-ish.
- **Include IDs** so the LLM can reference results in follow-up calls.
- **Truncate long lists** with a `total` count and a way to paginate.
- **Timestamps in ISO 8601**, UTC, always.
- **Don't return empty arrays as `[]` without context** — say `"found 0 matching customers"` so the LLM understands it's not an error.

## Security

- **Validate every input.** MCP tools are an injection surface — the LLM may be tricked into calling them with malicious arguments.
- **Parameterize all DB queries.** No string interpolation.
- **Authorize at the tool level.** "What can the LLM do" must be ≤ "what the user is allowed to do." Don't trust the LLM to respect ACLs.
- **Rate limit expensive tools** per session.
- **Secrets stay on the server side.** Never accept API keys as tool arguments.
- **Audit log** every tool call with arguments, caller, result status.

## Resource Design

- **URIs should be stable.** `customer://123/invoices` is fine. `random-guid/thing` is not.
- **Support partial reads** for large resources (offset + length).
- **Expose a resource list** that's discoverable — don't make the host guess URIs.

## Testing

- **Integration tests against a real MCP client.** The official SDKs have test harnesses — use them.
- **Test error paths**, not just happy paths. Invalid arguments, missing permissions, upstream failures.
- **Contract test your tool schemas.** If you rename a field, old clients break silently unless you version.

## Versioning & Compatibility

- Bump the server version when you change tool signatures.
- Keep old tools around as deprecated for one minor version before removing.
- Document breaking changes in the server's `initialize` response metadata.

## When to Build an MCP Server vs. Skill vs. Subagent

- **MCP server**: the capability involves external state, secrets, or infrastructure the LLM shouldn't touch directly. Database, billing, internal APIs.
- **Skill**: the capability is entirely in-context — a pattern, a workflow, a reference document. No external state, no credentials.
- **Subagent**: the capability requires isolated context or parallel work — reviewers, researchers, planners.

Don't build an MCP server for something that should be a skill.

## Relevant Skills

- `mcp-builder` (Anthropic official) — canonical guide for FastMCP Python and Node TS SDK, including tools/resources/prompts/Zod/transport patterns
- `api-connector-builder` — for building new connectors that match existing repo patterns
- `skill-creator` — when it should be a skill instead
