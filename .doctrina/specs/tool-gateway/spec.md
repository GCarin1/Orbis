# Spec — tool-gateway

**Capability:** tool-gateway
**Status:** active
**Implementation:** planned — in progress: registry, allowlist, MCP over HTTP and stdio, untrusted envelopes, the result cap and the team, conversation, draft, http, memory, computer and browser tools are verified; the tools of skills, routines and secrets register with their changes
**Realizes:** SC2, SC3
**Depends on:** bots, approvals
**Last updated:** 2026-09-27
**Version:** 0.2.2

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
- The system shall offer each bot only the tools that its allowlist permits, the default allowlist being every registered tool.
- The system shall send every tool call through the policy evaluation of `specs/approvals` before executing it.
- The system shall wrap content fetched from outside Orbis (web pages, HTTP responses, webhook payloads) in an `<untrusted-content source="...">` envelope before returning it to a brain.
- The system shall serve the registry over MCP (JSON-RPC 2.0, protocol version 2025-06-18) at `/mcp` for requests that carry a valid run token.
- The system shall cap every tool result returned to a brain at 20,000 characters, cutting the rest and appending a truncation marker.

### Event-driven

- When a tool call executes, the system shall append a `step.tool_call` and a `step.tool_result` event to the run.
- When an MCP client sends `tools/list` with a run token, the system shall answer with the tools allowed for that run's bot only.
- When an MCP client sends `tools/call` with a run token, the system shall execute the call as the run's bot inside that run.
- When a run ends, the system shall revoke its run token.
- When an MCP client sends a GET request to `/mcp`, the system shall answer 405 because the endpoint offers no server-sent stream.

### Unwanted-behavior (must-not)

- The system shall not execute a tool that is outside the calling bot's allowlist; it shall return an error result naming the tool instead.
- The system shall not accept an MCP request whose run token is missing, unknown or revoked; it shall answer 401.
- The system shall not send a request body or use a method other than GET or HEAD through `http.fetch`, so that data leaves Orbis only through a draft the user sends.

## Acceptance criteria

1. [verified] The registry lists every tool with its schema and risk class, and a bot with a restricted allowlist sees only its allowed tools — verified by `packages/hub/test/tools/registry.test.ts`.
2. [verified] A call to a tool outside the allowlist returns an error result and executes nothing — verified by `packages/hub/test/tools/registry.test.ts`.
3. [verified] `http.fetch` output arrives wrapped in `<untrusted-content>`, and a result longer than 20,000 characters is cut with a truncation marker — verified by `packages/hub/test/tools/registry.test.ts`.
4. [verified] `/mcp` answers `initialize`, `tools/list` and `tools/call` for a valid run token and 401 for a revoked one — verified by `packages/hub/test/tools/mcp.test.ts`.
5. [verified] The `orbis mcp` stdio bridge forwards `tools/list` and `tools/call` to the hub and prints the responses on stdout — verified by `packages/cli/test/mcp-bridge.test.ts`.

## Maturity

**MVP (committed):**

- Registry, allowlist, MCP over HTTP and stdio, untrusted envelopes, result cap.

**Future (aspirational, not committed):**

- Installing third-party MCP servers as connectors with tokens held by the hub.
- The X (Twitter) connector.
- Routing a bot's outbound traffic through the user's desktop.

## Out of scope for this spec

- The decision logic (see `specs/approvals`).
- The implementation of each computer and browser tool (see `specs/computer`).
