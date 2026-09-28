# Spec Delta — capability: tool-gateway

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/tool-gateway/spec.md`

---

```ops
set-header Implementation: verified — the registry, the allowlist with `!` exclusions, MCP over HTTP and stdio, untrusted envelopes, the result cap, and the MCP client with the marketplace (`packages/hub/src/mcp/`: stdio and streamable HTTP, OAuth sign-in, keys as hub secrets)
bump-version minor
replace-requirement ubiquitous 3: The system shall offer each bot only the tools that its allowlist permits: a pattern such as `computer.*` includes, a pattern starting with `!` excludes, the default allowlist `*` covers every Orbis tool, and a tool of an external MCP server is offered only when a pattern starting with `mcp.` names it.
append-requirement ubiquitous: The system shall connect external MCP servers — a program it starts (stdio) or a streamable HTTP endpoint — from a marketplace of checked servers or from a custom command or address, register each server's tools as `mcp.<server>.<tool>`, keep the tools known across restarts and start the server again on first use.
append-requirement ubiquitous: The system shall keep the keys, tokens and sign-ins of connected servers as hub secrets encrypted with the vault's key, pass them only to the server they belong to (as its environment or its `Authorization` header), and never return them through the API.
append-requirement event: When an HTTP server answers 401 and asks for an account, the system shall discover its authorization server, register itself as a client, give the user a sign-in link with PKCE, trade the code at `/oauth/mcp/callback` for tokens, refresh them before they expire, and connect.
append-requirement event: When a bot calls a tool of a connected server that is not marked read-only and no rule or grant decides, the system shall ask the user first; the result comes back wrapped as untrusted content.
append-requirement unwanted: The system shall not accept a sign-in callback whose state is unknown, expired or already used.
append-criterion [verified] A stdio server starts with its key as an encrypted secret, its tools reach only the bots given the server, a read-only tool runs and returns untrusted content, a writing tool asks unless a rule allows it, `!` excludes, the tools survive a restart, a missing program or an empty required key is reported, disconnecting removes the tools and the server from every allowlist; an HTTP server asking for an account gets Orbis registered, a PKCE sign-in link, the code traded on the callback, a connection over server-sent events, and a state used once — verified by `packages/hub/test/mcp-servers.test.ts`.
```
