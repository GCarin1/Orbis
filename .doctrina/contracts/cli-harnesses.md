# Contract — cli-harnesses

**Contract:** cli-harnesses
**Status:** active
**Last updated:** 2026-09-27

## Purpose

The seam between Orbis and the agent CLIs it drives as subscription brains.
Orbis does not own these programs; it owns how it calls them (argv, working
directory, environment, MCP wiring) and how it reads them (output format and
the mapping to normalized events). When a CLI changes its flags or output,
this is the one place to update, and the adapter tests replay each format
from a fake executable.

## Ports

| Service | Port | Protocol |
|---------|------|----------|

No harness listens on a port: each runs as a child process of the hub, speaks
on stdin/stdout, and reaches the hub through the `orbis mcp` stdio bridge.

## Environment

| Variable        | Required | Values | Example                |
|-----------------|----------|--------|------------------------|
| ORBIS_RUN_TOKEN | no       | —      | set by the hub per run |
| ORBIS_URL       | no       | —      | http://127.0.0.1:7420  |

The hub builds each harness environment from scratch: PATH, HOME, LANG, TERM,
USER, the harness's own login variables that already exist in the hub's
environment (for example `CLAUDE_CONFIG_DIR`, `CODEX_HOME`,
`GEMINI_API_KEY` only when the bot's brain names it), and — only inside the
MCP server entry — ORBIS_URL and ORBIS_RUN_TOKEN.

## Wiring

| Variable        | Origin | Workflow | Job/Step | Consumer                          |
|-----------------|--------|----------|----------|-----------------------------------|
| ORBIS_RUN_TOKEN | local  | —        | —        | packages/hub/src/mcp/bridge.ts    |
| ORBIS_URL       | local  | —        | —        | packages/cli/src/config.ts        |

## Budgets

| Limit                | Direction | Value       |
|----------------------|-----------|-------------|
| harness-run-timeout  | input     | 900 seconds |
| harness-stderr-kept  | output    | 8192 bytes  |

## Interfaces

Common to every harness: working directory = the bot's workspace; the
prompt carries the bot identity, description, context and task as described
in `specs/agent-runtimes`; the MCP server entry is the hub's own stdio bridge
script — the same code as `orbis mcp` —
`{ "command": "<node>", "args": ["<@orbis/hub>/dist/mcp-bridge.js"], "env": { "ORBIS_URL": "<hub url>", "ORBIS_RUN_TOKEN": "<run token>" } }`.
Orbis tools appear to the CLI with dots replaced by underscores
(`team.handoff` → `team_handoff`; Claude Code shows `mcp__orbis__team_handoff`).

### claude-code (Claude Code, subscription login)

- argv: `claude -p <prompt> --output-format stream-json --verbose --append-system-prompt <identity> [--model <model>] --mcp-config '{"mcpServers":{"orbis":{"type":"stdio",...entry}}}' --strict-mcp-config --permission-prompt-tool mcp__orbis__approval_prompt (--session-id <uuid> | --resume <uuid>)`.
- `approval_prompt` receives `{ tool_name, input, tool_use_id? }` and answers the text `{"behavior":"allow","updatedInput":<input>}` or `{"behavior":"deny","message":"..."}` after the Orbis policy (and the user, on `ask`) decided.
- The first run of a bot in a conversation passes a new `--session-id`; later runs pass `--resume` with the stored id.
- stdout: one JSON object per line. Mapping: `{"type":"system","subtype":"init"}` → `run.started` (session id kept); `{"type":"assistant"}` content blocks `text` → `step.text`, `thinking` → `step.thinking`, `tool_use` → `step.tool_call`; `{"type":"user"}` content blocks `tool_result` → `step.tool_result`; `{"type":"result"}` → `run.usage` from `usage` and `total_cost_usd` (subscription-covered), then `run.finished` with `result` as the reply, or `run.failed` when `is_error` is true. Every other `type` is ignored.

### codex (OpenAI Codex CLI, ChatGPT login)

- argv: `codex exec --json --skip-git-repo-check --sandbox workspace-write --cd <workspace> [-m <model>] -c mcp_servers.orbis.command=<json> -c mcp_servers.orbis.args=<json> -c mcp_servers.orbis.env=<toml inline table> <prompt>`; resume: `codex exec resume <thread-id> --json ... <prompt>`.
- stdout: one JSON object per line. Mapping: `thread.started` → `run.started` (thread id kept); `item.completed` with `item.type` `agent_message` → `step.text`, `reasoning` → `step.thinking`, `command_execution` → `step.tool_call` + `step.tool_result` (command, aggregated output, exit code), `mcp_tool_call` → `step.tool_call` + `step.tool_result`, `file_change` → `step.tool_result`; `turn.completed` → `run.usage` from `usage`; `turn.failed` or `error` → `run.failed`. The last `agent_message` is the reply.

### gemini-cli (Google Gemini CLI, Google login)

- The hub writes `<workspace>/.gemini/settings.json` with `{ "mcpServers": { "orbis": { ...server entry, "trust": true } } }` before each run.
- argv: `gemini -p <prompt> --output-format stream-json [-m <model>]`.
- stdout: one JSON object per line. Mapping: `init` → `run.started`; `message` with role `assistant` → `step.text` (deltas concatenated); `tool_use` → `step.tool_call`; `tool_result` → `step.tool_result`; `result` → `run.usage` from `stats` then `run.finished`; `error` → `run.failed`.
- Fallback: when the first stdout line is not JSON Lines, the whole stdout is read as `--output-format json` (`{ response, stats, error? }`).

### custom-cli (any command)

- argv: the bot's `command` and `args`, where the literal `{prompt}` in an argument is replaced by the prompt; with no `{prompt}` argument the prompt is written to stdin.
- stdout: plain text, the whole of it being the reply → `step.text` then `run.finished`. No tool calls, no usage.

### Exit status

- Exit 0 with a reply → `run.finished`. Non-zero exit, a timeout, or no reply → `run.failed` carrying the last 8192 bytes of stderr.

## References

- `specs/agent-runtimes`
- `specs/tool-gateway`
- `specs/skills`
