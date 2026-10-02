# Spec — cli

**Capability:** cli
**Status:** active
**Implementation:** verified — every command group listed above, `bots export|import` included
**Realizes:** SC7
**Depends on:** hub-api
**Last updated:** 2026-09-27
**Version:** 0.11.0

## Purpose

`orbis` is the terminal client: it starts the hub, manages bots, chats with
them (one-shot or interactive, with inline approvals), and runs the MCP stdio
bridge that CLI brains and external agents use to reach the tool gateway.
It talks to the hub only through the public API.

## Requirements (EARS)

### Ubiquitous

- The CLI shall resolve the hub URL and token from, in order: the `--url` and `--token` flags, the ORBIS_URL and ORBIS_TOKEN environment variables, the file `~/.config/orbis/config.json`, and for a hub on the same machine the data directory `token` file with the default URL `http://127.0.0.1:7420`.
- The CLI shall provide the commands `serve`, `login`, `bots list|create|show|edit|delete|duplicate|export|import`, `chat`, `group create|list|chat|add|remove|delete`, `memory list|add|edit|rm`, `approvals list|allow|deny`, `skills list|add|show|remove`, `routines list|add|test|enable|disable|remove|runs`, `secrets list|set|rm`, `usage`, `runtimes check|test` and `mcp`.
- The CLI shall print machine-readable JSON for every listing command given `--json`.
- The CLI shall exit 0 on success, 1 when the requested operation failed and 2 on a usage error.
- The CLI shall set a bot's manager with `--reports-to @handle` on `bots create` and `bots edit` (`none` clears it), and name the manager in `bots list` and `bots show`.
- The repository shall provide `Orbis-Atalhos.bat`, which creates shortcuts to the two launchers, with the Orbis icon, on the Desktop and in the Start menu.

### Event-driven

- When `orbis chat @<handle> "<message>"` runs, the CLI shall post the message, print the bot's steps and reply as they stream, and exit when the run ends, with status 1 when the run failed.
- When `orbis chat @<handle>` runs with no message on a terminal, the CLI shall open an interactive session that sends each entered line and prints the streamed reply.
- When a run waits for approval during `orbis chat` on a terminal, the CLI shall ask allow once, allow always or deny inline and send the answer.
- When `orbis serve` runs, the CLI shall start the hub in the foreground and print its URL and the path of the token file.
- When `orbis mcp` runs, the CLI shall act as an MCP stdio server that forwards every request to the hub's `/mcp` endpoint with the run token from ORBIS_RUN_TOKEN.
- When `orbis group chat <group> "<message>"` runs, the CLI shall post the message to the group, print the steps and replies of every bot the message starts and of the runs those bots start by handoff or mention, and exit when all of them have ended.
- When `orbis routines test <id>` runs, the CLI shall wait for the draft-only test run to end, print its status and reply, and exit 1 when it failed.
- When `orbis runtimes test <kind>` or `orbis runtimes test @<handle>` runs, the CLI shall print the brain's reply to the test question and its duration, say when no model answered, and exit 1 when the test failed.
- When `orbis chat` follows a message, the CLI shall also stream the runs that handoffs, mentions and reports back start in that conversation, and exit when all of them have ended.
- When `Orbis.bat` runs and an Orbis hub already answers on the port (ORBIS_PORT, default 7420), the launcher shall build, stop that hub and the processes it started, wait for the port, start `orbis serve` in its own window and open the web app signed in, and the window the old hub ran in shall close without an error.
- When `Orbis.bat` runs with no Orbis hub on the port, the launcher shall install the dependencies when they are missing, build, start `orbis serve` in its window and open the web app signed in, building unless given `--rapido`.
- When `Orbis-Token.bat` runs, the launcher shall show the login token of the data directory, creating it in the hub's own format when there is none, copy it to the clipboard and print the address that opens the web app signed in; given `--novo` it shall replace the token after asking.

### Unwanted-behavior (must-not)

- The CLI shall not print the API token in any output other than `orbis login --show-token`.
- The CLI shall not take a secret value as a command-line argument; `orbis secrets set` reads it from a hidden prompt or from stdin.
- The `orbis chat` and `orbis group chat` commands shall not follow runs of another message's chain in the same conversation.
- The launcher shall not stop a process that does not answer as an Orbis hub, nor the desktop app, nor a running Orbis when the build failed; it shall name what holds the port and exit with status 1.

## Acceptance criteria

1. [verified] Flags beat environment variables, which beat the config file — verified by `packages/cli/test/config.test.ts`.
2. [verified] `orbis chat @<handle> "hi"` against a test hub prints the mock bot's reply and exits 0 — verified by `packages/cli/test/chat.test.ts`.
3. [verified] `orbis bots create` then `orbis bots list --json` prints the new bot as JSON — verified by `packages/cli/test/bots.test.ts`.
4. [verified] During `orbis chat`, a pending approval is answered from the prompt and the run completes — verified by `packages/cli/test/chat.test.ts`.
5. [verified] `orbis group create` then `orbis group chat` prints the reply of the mentioned member, and `orbis memory add --team` then `orbis memory list --team --json` prints the entry — verified by `packages/cli/test/collab.test.ts`.
6. [verified] `orbis skills add|list|show|remove` manage account and bot skills and a `/skill` chat runs with the skill; `orbis routines add|test|enable|runs|remove` drive a routine from creation to enabled — verified by `packages/cli/test/skills-routines.test.ts`.
7. [verified] `orbis secrets set` stores a value piped on stdin and `orbis secrets list` shows names only; `orbis usage` prints this month's runs, cost and cap per bot and the total — verified by `packages/cli/test/secrets-usage.test.ts`.
8. [verified] `orbis bots export` writes a template (to stdout or `--out`), `orbis bots import` creates a new bot from a file or stdin, and an export holding a GitHub token fails naming its line — verified by `packages/cli/test/templates.test.ts`.
9. [verified] `orbis runtimes check` lists the subscription CLIs and the local model servers, and `orbis runtimes test` prints a bot's test reply, flags the mock's echo and exits 1 on a failed test — verified by `packages/cli/test/runtimes.test.ts`.
10. [verified] `orbis bots create --reports-to @chief` and `orbis bots edit --reports-to none` set and clear the manager, `bots list` and `bots show` name it, and a reporting loop exits 1 naming it — verified by `packages/cli/test/bots.test.ts`.
11. [verified] `orbis chat` after a handoff prints the receiver's answer and then the sender's report back before it exits — verified by `packages/cli/test/collab.test.ts`.
12. [verified] While `orbis chat` waits for its own run, a colleague's mention run in the same conversation is neither waited for nor printed — verified by `packages/cli/test/audit-cycle4.test.ts`.
13. [verified] A second launcher on the same port restarts the first one with the same data and token, the first window ends with status 0 and says why, and Ctrl+C on the new one ends it quietly; a program that is not Orbis on the port is named and left running with exit status 1; a failed build leaves the running Orbis untouched; the port's owner is read from the netstat tables of an English and a Portuguese Windows; the token is created in the hub's format, kept, replaced only when asked, and left alone when ORBIS_TOKEN decides; the icon holds seven sizes up to 256 pixels and the shortcuts use it — verified by `packages/cli/test/windows-launcher.test.ts`.

## Maturity

**MVP (committed):**

- Every command listed above, JSON output, inline approvals, MCP bridge.

**Future (aspirational, not committed):**

- A full-screen terminal UI with the roster and timeline side by side.

## Out of scope for this spec

- The MCP tool semantics (see `specs/tool-gateway`).
