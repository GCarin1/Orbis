# Design — Change 0013-brains-settings

## Approach

Cursor is a third subscription CLI driven like Gemini CLI: its headless mode
(`agent -p --output-format stream-json`) prints one JSON event per line,
documented in Cursor's CLI output-format reference, and it reads MCP servers
from the workspace's `.cursor/mcp.json`. The adapter writes the Orbis MCP
server there for the run, allows only `Mcp(orbis:*)` in `.cursor/cli.json`,
passes `--trust` and `--approve-mcps` so a headless run never waits on a
prompt, and restores both files afterwards so the run token does not stay on
disk. Chats resume with `--resume <session_id>` like Claude Code sessions.

Ollama and LM Studio are not new protocols: both serve the OpenAI Chat
Completions API. The OpenAI adapter becomes a factory, and the two local
kinds differ only in their default address (configurable), never sending
OPENAI_API_KEY, and requiring a model. Because Ollama rejects tools outright
for models without tool support (such as `gemma3:1b`), a 4xx answer that says so makes the turn retry once without
tools.

The brain test answers the owner's question — "is it really Claude?" — with
evidence rather than labels: it runs the chosen adapter once on a question
whose answer an echo cannot contain (17 × 23 = 391), with no tools, no MCP
and a scratch directory, and reports the reply and duration. The mock brain
runs too, and the result says no model answered.

## Alternatives considered

- Configure Ollama and LM Studio as presets of the `openai` kind in the web
  app only: rejected, the bot would still read "openai" everywhere (header,
  CLI, templates), hiding which server a bot uses.
- Run Windows `.cmd` shims through `cmd.exe` with escaping: rejected,
  `cmd.exe` ends a command at a line break, and every prompt holds line breaks (identity, context, task).
- Pass `--force` to Cursor so its shell and write tools run unattended:
  rejected, they would bypass the Orbis approvals; the bot has the Orbis
  computer tools, which go through the policy.

## Trade-offs and risks

- Cursor's CLI is young and its event shapes may change; the mapping ignores
  unknown event types and the fake CLI pins the documented format.
  `contracts/cli-harnesses` is the single place to update.
- Cursor reports no token counts, so its runs show zero tokens in the usage
  screen.
- The brain test spends a little subscription quota each time it is pressed;
  the screen says so, and one test per bot or brain kind runs at a time.

## Decisions to record as ADRs

- None: the new brains stay within the two families of ADR 0003, reach tools
  through the gateway of ADR 0004, and the policy of ADR 0006 still decides
  every Orbis tool call.
