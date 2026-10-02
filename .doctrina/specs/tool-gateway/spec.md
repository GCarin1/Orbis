# Spec — tool-gateway

**Capability:** tool-gateway
**Status:** active
**Implementation:** verified — the registry, the allowlist with `!` exclusions, MCP over HTTP and stdio, untrusted envelopes, the result cap, and the MCP client with the marketplace (`packages/hub/src/mcp/`: stdio and streamable HTTP, OAuth sign-in, keys as hub secrets)
**Realizes:** SC2, SC3
**Depends on:** bots, approvals
**Last updated:** 2026-09-27
**Version:** 0.5.0

## Purpose

Capabilities belong to the account; context belongs to the bot. The tool
gateway is the single account-level registry of what bots can do (hand off,
remember, draft, use their computer, browse, fetch, read skills, create
routines, ask for secrets). It offers the same tools to API brains in-process
and to CLI brains over MCP, filters them by the bot's allowlist, sends every
call through the approvals policy and marks outside content as untrusted.

## Requirements (EARS)

### Ubiquitous

- The system shall keep one account-level tool registry in which every tool has a name, a description, a JSON Schema for its input and a risk class of `read`, `write` or `external`.
- The system shall register at least these tools: `team.list_bots`, `team.handoff`, `conversation.post`, `memory.save`, `memory.search`, `draft.create`, `computer.shell`, `computer.read_file`, `computer.write_file`, `computer.list_files`, `browser.open`, `browser.snapshot`, `browser.click`, `browser.type`, `browser.screenshot`, `http.fetch`, `skills.list`, `skills.read`, `routine.create`, `routine.list` and `secret.request`.
- The system shall offer each bot only the tools that its allowlist permits: a pattern such as `computer.*` includes, a pattern starting with `!` excludes, the default allowlist `*` covers every Orbis tool, and a tool of an external MCP server is offered only when a pattern starting with `mcp.` names it.
- The system shall send every tool call through the policy evaluation of `specs/approvals` before executing it.
- The system shall wrap content fetched from outside Orbis (web pages, HTTP responses, webhook payloads) in an `<untrusted-content source="...">` envelope before returning it to a brain.
- The system shall serve the registry over MCP (JSON-RPC 2.0, protocol version 2025-06-18) at `/mcp` for requests that carry a valid run token.
- The system shall cap every tool result returned to a brain at 20,000 characters, cutting the rest and appending a truncation marker.
- The system shall connect external MCP servers — a program it starts (stdio) or a streamable HTTP endpoint — from a marketplace of checked servers or from a custom command or address, register each server's tools as `mcp.<server>.<tool>`, keep the tools known across restarts and start the server again on first use.
- The system shall keep the keys, tokens and sign-ins of connected servers as hub secrets encrypted with the vault's key, pass them only to the server they belong to (as its environment or its `Authorization` header), and never return them through the API.
- The system shall return from `team.list_bots` each bot's handle without `@`, its name, role, busy flag and state.

### Event-driven

- When a tool call executes, the system shall append a `step.tool_call` and a `step.tool_result` event to the run.
- When an MCP client sends `tools/list` with a run token, the system shall answer with the tools allowed for that run's bot only.
- When an MCP client sends `tools/call` with a run token, the system shall execute the call as the run's bot inside that run.
- When a run ends, the system shall revoke its run token.
- When an MCP client sends a GET request to `/mcp`, the system shall answer 405 because the endpoint offers no server-sent stream.
- When an HTTP server answers 401 and asks for an account, the system shall discover its authorization server, register itself as a client, give the user a sign-in link with PKCE, trade the code at `/oauth/mcp/callback` for tokens, refresh them before they expire, and connect.
- When a bot calls a tool of a connected server that is not marked read-only and no rule or grant decides, the system shall ask the user first; the result comes back wrapped as untrusted content.
- When a stdio MCP server stops, the system shall report the error line of its output, not the runtime's closing lines.

### Unwanted-behavior (must-not)

- The system shall not execute a tool that is outside the calling bot's allowlist; it shall return an error result naming the tool instead.
- The system shall not accept an MCP request whose run token is missing, unknown or revoked; it shall answer 401.
- The system shall not send a request body or use a method other than GET or HEAD through `http.fetch`, so that data leaves Orbis only through a draft the user sends.
- The system shall not accept a sign-in callback whose state is unknown, expired or already used.
- The system shall not run a tool call identical (same tool, same input) to two earlier calls of the same run, except the tools that read changing state (browser snapshot, screenshot, press and close, the team list, the skill and routine lists); it shall return an error result telling the bot to use the results it has.

## Acceptance criteria

1. [verified] The registry lists every tool with its schema and risk class, and a bot with a restricted allowlist sees only its allowed tools — verified by `packages/hub/test/tools/registry.test.ts`.
2. [verified] A call to a tool outside the allowlist returns an error result and executes nothing — verified by `packages/hub/test/tools/registry.test.ts`.
3. [verified] `http.fetch` output arrives wrapped in `<untrusted-content>`, and a result longer than 20,000 characters is cut with a truncation marker — verified by `packages/hub/test/tools/registry.test.ts`.
4. [verified] `/mcp` answers `initialize`, `tools/list` and `tools/call` for a valid run token and 401 for a revoked one — verified by `packages/hub/test/tools/mcp.test.ts`.
5. [verified] The `orbis mcp` stdio bridge forwards `tools/list` and `tools/call` to the hub and prints the responses on stdout — verified by `packages/cli/test/mcp-bridge.test.ts`.
6. [verified] A stdio server starts with its key as an encrypted secret, its tools reach only the bots given the server, a read-only tool runs and returns untrusted content, a writing tool asks unless a rule allows it, `!` excludes, the tools survive a restart, a missing program or an empty required key is reported, disconnecting removes the tools and the server from every allowlist; an HTTP server asking for an account gets Orbis registered, a PKCE sign-in link, the code traded on the callback, a connection over server-sent events, and a state used once — verified by `packages/hub/test/mcp-servers.test.ts`.
7. [verified] The third identical `memory.search` of a run is refused while a different one runs, and `team.list_bots` returns handles without `@` — verified by `packages/hub/test/bot-behaviour.test.ts`.

## Maturity

**MVP (committed):**

- Registry, allowlist, MCP over HTTP and stdio, untrusted envelopes, result cap.
- Third-party MCP servers connected from the marketplace, with keys and sign-ins held by the hub (change 0018).

**Future (aspirational, not committed):**

- The X (Twitter) connector.
- Routing a bot's outbound traffic through the user's desktop.

## Out of scope for this spec

- The decision logic (see `specs/approvals`).
- The implementation of each computer and browser tool (see `specs/computer`).
