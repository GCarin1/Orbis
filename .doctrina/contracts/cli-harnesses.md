# Contract — cli-harnesses

**Contract:** cli-harnesses
**Status:** active
**Last updated:** 2026-10-03

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
| ORBIS_URL       | no       | —      | the hub URL, per run   |

The hub builds each harness environment from scratch: PATH, HOME, LANG, TERM,
USER, the harness's own login variables that already exist in the hub's
environment (for example `CLAUDE_CONFIG_DIR`, `CODEX_HOME`,
`GEMINI_API_KEY` only when the bot's brain names it), and — only inside the
MCP server entry — ORBIS_URL and ORBIS_RUN_TOKEN. Claude Code alone also gets
`CLAUDE_CODE_OAUTH_TOKEN`, the subscription token `claude setup-token` prints:
the bot's own secret of that name, else the one saved in Settings → Brains,
else the hub's environment variable. It never gets `ANTHROPIC_API_KEY` or
`ANTHROPIC_AUTH_TOKEN`, which Claude Code would put before the token and bill
to the API.

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

- argv: `codex exec --json --skip-git-repo-check --sandbox workspace-write --cd <workspace> [-m <model>] -c mcp_servers.orbis.command=<json string> -c mcp_servers.orbis.args=<json array> -c mcp_servers.orbis.env={KEY="value",...} <prompt>`; resume keeps every `exec` option before the subcommand: `codex exec <options> resume <thread-id> <prompt>`.
- The first run sends the whole prompt (identity, context, task); a resumed run sends only the recent conversation and the task.
- stdout: one JSON object per line. Mapping: `thread.started` → `run.started` (thread id kept); `item.completed` with `item.type` `agent_message` → `step.text`, `reasoning` → `step.thinking`, `command_execution` → `step.tool_call` + `step.tool_result` (command, aggregated output, exit code), `mcp_tool_call` → `step.tool_call` + `step.tool_result`, `file_change` → `step.tool_result`; `turn.completed` → `run.usage` from `usage`; `turn.failed` or `error` → `run.failed`. The last `agent_message` is the reply.

### gemini-cli (Google Gemini CLI, Google login)

- The hub writes `<workspace>/.gemini/settings.json` with `{ "mcpServers": { "orbis": { ...server entry, "trust": true } } }` before each run.
- argv: `gemini -p <prompt> --output-format stream-json [-m <model>]`.
- stdout: one JSON object per line. Mapping: `init` → `run.started`; `message` with role `assistant` → `step.text` (deltas concatenated); `tool_use` → `step.tool_call`; `tool_result` → `step.tool_result`; `result` → `run.usage` from `stats` then `run.finished`; `error` → `run.failed`.
- Assistant text before a `tool_use` becomes a `step.text`; the reply is the assistant text after the last tool call.
- Fallback: when no stdout line is a JSON object with a `type`, the whole stdout is read as `--output-format json` (`{ response, stats, error? }`).
- The settings file is restored (or removed) when the run ends, so the run token does not stay in the workspace.

### cursor (Cursor CLI, Cursor login)

- Executable: the bot's `command`, else the first of `cursor-agent` and `agent` on PATH (Cursor's installer names it `agent`).
- The hub writes, for the run only, `<workspace>/.cursor/mcp.json` with `{ "mcpServers": { "orbis": { "type": "stdio", ...server entry } } }` and adds `Mcp(orbis:*)` to `permissions.allow` in `<workspace>/.cursor/cli.json`, keeping whatever else the files hold; both are restored (or removed) when the run ends, so the run token does not stay in the workspace.
- argv: `agent -p --output-format stream-json --trust --workspace <workspace> [--approve-mcps] [--model <model>] [--resume <chat-id>] <prompt>`; `--approve-mcps` only when the run has the MCP bridge. Orbis never passes `--force`: Cursor's own shell and write tools keep Cursor's permission rules, and the bot's Orbis tools keep the Orbis policy.
- The prompt is the whole prompt (identity, context, task), last on the command line.
- The first run of a bot in a conversation starts a new chat; later runs pass `--resume` with the stored `session_id`. A stored chat that fails before printing any event is forgotten and the run starts a new chat.
- stdout: one JSON object per line. Mapping: `{"type":"system","subtype":"init"}` → `run.started` (session id kept); `{"type":"assistant"}` text blocks → `step.text`; `{"type":"tool_call","subtype":"started"}` → `step.tool_call` and `"completed"` → `step.tool_result`, the tool named by the `tool_call` key without its `ToolCall` suffix (`readToolCall` → `read`), by `function.name`, or by the tool name inside an MCP call's `args`, and the result failing when it holds no `success`; `{"type":"result"}` → `run.usage` with zero tokens (Cursor reports none; subscription-covered), then `run.finished` with `result` as the reply, or `run.failed` when `is_error` is true or `subtype` is not `success`. Every other `type` is ignored.

### ollama and lmstudio (local model servers, no login)

- Not child processes: the hub calls the server's OpenAI-compatible Chat Completions API like the `openai` brain, at the bot's `baseUrl`, else `ORBIS_OLLAMA_URL` (default `http://127.0.0.1:11434/v1`) or `ORBIS_LMSTUDIO_URL` (default `http://127.0.0.1:1234/v1`), with no key unless the bot names an `apiKeySecret`.
- Model list: `GET <baseUrl>/models` → `{ data: [{ id }] }`.
- A 4xx answer saying the model does not support tools makes the run retry once without tools and note it as a thinking step.

### custom-cli (any command)

- argv: the bot's `command` and `args`, where the literal `{prompt}` in an argument is replaced by the prompt; with no `{prompt}` argument the prompt is written to stdin.
- stdout: plain text, the whole of it being the reply → `step.text` then `run.finished`. No tool calls, no usage.

### Exit status

- Exit 0 with a reply → `run.finished`. Non-zero exit, a timeout, or no reply → `run.failed` carrying the last 8192 bytes of stderr.

### Windows `.cmd` shims

- On Windows a CLI installed by npm (and installers like it) is a `.cmd` or `.bat` file, which Node.js cannot start without `cmd.exe`, and `cmd.exe` cuts a multi-line prompt at its first line break. The hub reads the shim, finds the quoted `.js`/`.mjs`/`.cjs` script under `%dp0%`/`%~dp0`, and runs it with the `node.exe` next to the shim, else the hub's own Node.js, followed by the harness argv. A batch file naming no such script fails the run, asking for the program's `.exe` or `.js` as the brain's `command`. The health check runs `--version` the same way.

### Brain test

- `POST /api/v1/runtimes/test` runs a harness once with the task `What is 17 × 23? Answer with the number only.`, a one-line identity, no history, no MCP server and no tools, in a scratch directory under `<data>/brain-tests/` that is removed afterwards; `answered` is true when the reply holds `391`.

## References

- `specs/agent-runtimes`
- `specs/tool-gateway`
- `specs/skills`
