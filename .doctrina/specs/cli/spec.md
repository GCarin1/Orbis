# Spec — cli

**Capability:** cli
**Status:** active
**Implementation:** planned — in progress: configuration, serve, bots and chat are verified since change 0001; inline approvals and the remaining command groups land with their capabilities
**Realizes:** SC7
**Depends on:** hub-api
**Last updated:** 2026-09-27
**Version:** 0.2.0

## Purpose

`orbis` is the terminal client: it starts the hub, manages bots, chats with
them (one-shot or interactive, with inline approvals), and runs the MCP stdio
bridge that CLI brains and external agents use to reach the tool gateway.
It talks to the hub only through the public API.

## Requirements (EARS)

### Ubiquitous

- The CLI shall resolve the hub URL and token from, in order: the `--url` and `--token` flags, the ORBIS_URL and ORBIS_TOKEN environment variables, the file `~/.config/orbis/config.json`, and for a hub on the same machine the data directory `token` file with the default URL `http://127.0.0.1:7420`.
- The CLI shall provide the commands `serve`, `login`, `bots list|create|show|edit|delete|duplicate|export|import`, `chat`, `group create`, `approvals list|allow|deny`, `skills list|add|remove`, `routines list|add|test|enable|disable|remove`, `usage`, `runtimes check` and `mcp`.
- The CLI shall print machine-readable JSON for every listing command given `--json`.
- The CLI shall exit 0 on success, 1 when the requested operation failed and 2 on a usage error.

### Event-driven

- When `orbis chat @<handle> "<message>"` runs, the CLI shall post the message, print the bot's steps and reply as they stream, and exit when the run ends, with status 1 when the run failed.
- When `orbis chat @<handle>` runs with no message on a terminal, the CLI shall open an interactive session that sends each entered line and prints the streamed reply.
- When a run waits for approval during `orbis chat` on a terminal, the CLI shall ask allow once, allow always or deny inline and send the answer.
- When `orbis serve` runs, the CLI shall start the hub in the foreground and print its URL and the path of the token file.
- When `orbis mcp` runs, the CLI shall act as an MCP stdio server that forwards every request to the hub's `/mcp` endpoint with the run token from ORBIS_RUN_TOKEN.

### Unwanted-behavior (must-not)

- The CLI shall not print the API token in any output other than `orbis login --show-token`.

## Acceptance criteria

1. [verified] Flags beat environment variables, which beat the config file — verified by `packages/cli/test/config.test.ts`.
2. [verified] `orbis chat @<handle> "hi"` against a test hub prints the mock bot's reply and exits 0 — verified by `packages/cli/test/chat.test.ts`.
3. [verified] `orbis bots create` then `orbis bots list --json` prints the new bot as JSON — verified by `packages/cli/test/bots.test.ts`.
4. [unverified] During `orbis chat`, a pending approval is answered from the prompt and the run completes — verified by `packages/cli/test/chat.test.ts`.

## Maturity

**MVP (committed):**

- Every command listed above, JSON output, inline approvals, MCP bridge.

**Future (aspirational, not committed):**

- A full-screen terminal UI with the roster and timeline side by side.

## Out of scope for this spec

- The MCP tool semantics (see `specs/tool-gateway`).
