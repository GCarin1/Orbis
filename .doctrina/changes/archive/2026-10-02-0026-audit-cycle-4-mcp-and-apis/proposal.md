# Change 0026-audit-cycle-4-mcp-and-apis — Audit cycle 4 — MCP and APIs

- **Status:** applied
- **Applied:** 2026-10-02
- **Date:** 2026-10-02
- **Owner:** Claude Code
- **Lane:** product (confident; signals: bug, audit)
- **Affects specs:** tool-gateway, hub-api, cli

## Why

Cycle 4 of the five audit-and-fix cycles: the external MCP servers the
marketplace connects, the OpenAI-compatible API and the `orbis` command.

## What

- A tool's wire name was `mcp_<server>_<tool>` with no length limit. Model
  APIs refuse names over 64 characters and Claude Code adds `mcp__orbis__`:
  a server with a long name made **every** reply of the bots given it fail.
  Wire names now stay within 52 characters, unique and mapped back.
- An HTTP MCP server that ends its session answers 404; the call failed
  every time until the user reconnected. Orbis now connects again once.
- A run stopped while an MCP call was in progress waited for the server's
  answer (up to its timeout); it now stops waiting.
- `/v1/chat/completions` crashed with a 500 when the message started no run
  (a `/skill` the bot is not offered); it answers 400 `no_run`.
- `orbis chat` followed any handoff, mention or report in the conversation,
  another message's included; it follows its own chain only.
- Tests: `packages/hub/test/audit-cycle4.test.ts`,
  `packages/cli/test/audit-cycle4.test.ts`. Docs: CHANGELOG,
  `docs/bot-behaviour-audit.md`.

## Scope boundaries

- The stdio client, OAuth and the catalog were read and found sound.

## Verification

- [x] Automated checks pass: `npm run typecheck`, every Vitest project and `npm run build`.
- [x] The affected specs' acceptance criteria are met and cite their evidence (`doctrina coverage`).

## Open questions

None.
