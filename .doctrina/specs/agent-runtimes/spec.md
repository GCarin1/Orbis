# Spec — agent-runtimes

**Capability:** agent-runtimes
**Status:** active
**Implementation:** verified — ten adapters (mock, anthropic, openai, ollama, lmstudio, claude-code, codex, gemini-cli, cursor, custom-cli), normalized events, session resume for Claude Code, Codex and Cursor, MCP bridge, health check with the local model servers, the brain test, Windows .cmd shims
**Realizes:** SC2
**Depends on:** bots, tool-gateway, memory
**Last updated:** 2026-09-27
**Version:** 0.9.0

## Purpose

A brain is what thinks for a bot. Orbis lets each bot pick its brain: a paid
model API, a local model served by Ollama, LM Studio or another
OpenAI-compatible server, or an agent CLI the user already pays for through a
subscription (Claude Code, Codex, Gemini CLI, Cursor) driven headless with no
API key. A brain test proves which brain answers. Every brain is wrapped by an adapter
that turns its output into one normalized event stream, so the rest of Orbis
never knows which brain ran. The exact argv and output formats of each CLI
brain are owned by `contracts/cli-harnesses`.

## Requirements (EARS)

### Ubiquitous

- The system shall run every bot turn through the brain adapter selected in the bot's brain configuration, one of `mock`, `anthropic`, `openai`, `ollama`, `lmstudio`, `claude-code`, `codex`, `gemini-cli`, `cursor` or `custom-cli`.
- The system shall translate every brain's output into the normalized events `run.started`, `step.thinking`, `step.text`, `step.tool_call`, `step.tool_result`, `run.usage`, `run.finished` and `run.failed`.
- The system shall build the input of every brain from the bot's identity and description, the context assembled by `specs/memory`, the invoked skill when there is one, and the task of the moment.
- The system shall run the CLI brains (`claude-code`, `codex`, `gemini-cli`, `cursor`, `custom-cli`) as child processes whose working directory is the bot's computer workspace and which authenticate with the CLI's own login, with no API key supplied by Orbis.
- The system shall connect every CLI brain that supports MCP to the Orbis tool gateway through the `orbis mcp` stdio bridge, authenticated with a run token, so that CLI brains and API brains reach the same tools.
- The system shall run the `mock` brain deterministically from its input, with no network access, for tests and demos.
- The system shall use `claude-opus-5` for an `anthropic` brain that names no model, with adaptive thinking on the models that support it.
- The system shall run the `ollama` and `lmstudio` brains through the OpenAI-compatible adapter at the bot's base URL, else at ORBIS_OLLAMA_URL (default `http://127.0.0.1:11434/v1`) or ORBIS_LMSTUDIO_URL (default `http://127.0.0.1:1234/v1`), with no API key unless the bot names a key secret.
- The system shall start a Windows `.cmd` or `.bat` CLI brain by running the Node.js script that file points to, so that a multi-line prompt reaches the CLI as one argument.
- The system shall stop a CLI brain's process at the run's time limit only through the run's own clock, which does not count the time the run waits for the user; the process has no wall-clock limit of its own.
- The system shall send a CLI brain a prompt longer than 8,000 characters on its standard input instead of its command line (Claude Code `-p` with no prompt argument, Codex `-`).
- The system shall tell every bot today's date and the hub's time zone, and to answer in the language the user writes in.
- The system shall provide the `chat-http` brain: a POST to the address the user gives (`baseUrl`) with the Bearer token of a bot secret (`apiKeySecret`, default `CHAT_BEARER_TOKEN`) and a `multipart/form-data` body whose `data` field holds the chat id, the agent, the message, and the model and request settings.
- The system shall read a `chat-http` answer streamed as server-sent events, JSON lines, one JSON document or plain text, joining pieces or taking a growing answer whole, and skipping status, reference and user-echo events.

### Event-driven

- When an API brain (`anthropic` or `openai`) returns tool calls, the system shall execute each one through the tool gateway and send the results back to the brain, repeating until the brain ends its turn or the run reaches its step limit (default 25 steps).
- When a `claude-code` run finishes, the system shall store the Claude Code session id for that bot and conversation and pass it with `--resume` on the bot's next run in the same conversation.
- When a `codex` run finishes, the system shall store the Codex thread id for that bot and conversation and resume it on the bot's next run in the same conversation.
- When Claude Code asks for permission to use one of its built-in tools, the system shall decide through `specs/approvals` by serving the MCP tool named in `--permission-prompt-tool`.
- When a brain process exits with a non-zero status, or a run works longer than its timeout (default 15 minutes), not counting the time it waits for the user's approval or answer, the system shall stop the process, mark the run failed with the error text and set the bot state to `blocked`.
- When a user requests the brain health check, the system shall report for each CLI brain (`claude-code`, `codex`, `gemini-cli`, `cursor`) whether its executable is found on PATH and the version it prints, and for each local model server (`ollama`, `lmstudio`) whether it answers and the models it serves.
- When an `anthropic` brain runs `claude-opus-5`, `claude-opus-5-5` or `claude-fable-5-1` against the first-party API, the system shall request the server-side refusal fallback (`fallbacks: "default"`).
- When a `cursor` run finishes, the system shall store the Cursor chat id for that bot and conversation and pass it with `--resume` on the bot's next run in the same conversation.
- When a `cursor` run starts with the MCP bridge, the system shall write the Orbis MCP server into the workspace's `.cursor/mcp.json`, allow `Mcp(orbis:*)` in the workspace's `.cursor/cli.json`, and restore both files when the run ends.
- When a local model server answers that the model does not support tools, the system shall retry the turn once without tools and record that as a thinking step.
- When a user requests a brain test for a bot or a brain configuration, the system shall ask that brain "What is 17 × 23? Answer with the number only." with no tools, no history and a scratch working directory, and report whether it ran, its reply, its duration and whether the reply holds 391.
- When the user asks from the settings screen, the system shall install the Codex CLI with `npm install -g @openai/codex@latest`, start its sign-in with the user's ChatGPT account — `codex login` in the browser of the hub's machine, or `codex login --device-auth` with a link and a one-time code for any device — report the link and the code as Codex prints them, report the account from `codex login status`, cancel a sign-in, and sign out with `codex logout`.
- When an API brain (openai, anthropic, ollama, lmstudio) reaches its last allowed step, the system shall send that request without tools and ask the model to answer with what it found.
- When an API brain cannot reach its server, the system shall fail the run naming the address, the network error code and the server to start.
- When a bot's brain is not ready (no API key, no CLI), the system shall fail its run with the reason and a pointer to that bot's settings.
- When the hub starts, the system shall set every bot whose state is neither `idle` nor `done` to `idle`.
- When a stored Claude Code, Codex or Cursor session can no longer be resumed, the system shall start a new session with the whole recent conversation, not only what came after the last run.
- When the Codex CLI or the Gemini CLI starts the Orbis MCP server, the system shall set its tool timeout to 24 hours, so a call waiting for the user's approval is not abandoned.
- When an OpenAI-compatible server answers 429, 500, 502, 503 or 504, the system shall wait for its Retry-After (at most 30 s) or 2 s then 6 s, and send the same step again up to twice.
- When an OpenAI-compatible server returns tool calls, the system shall run them whatever finish reason it gives, and when a reply holds `<think>` blocks, the system shall show them as thinking and leave them out of the reply.
- When a CLI brain resumes its session in a conversation, the system shall send it what was written there since its last run there started, except its own replies of that run.
- When a `chat-http` answer carries a chat id, the system shall continue that chat in the run's next requests and in the conversation's next runs, sending only what is new, and start a new chat with the whole conversation when the stored one is refused.
- When a `chat-http` bot has tools, the system shall tell it to ask for one in a ```tool block, run the tool through the gateway and send the result as the next message.

### State-driven

- While the hub runs on Windows, the system shall run an npm `.cmd` shim without cmd.exe: its Node.js script with node — for npm's own npx.cmd and npm.cmd the `*-cli.js` script, not `npm-prefix.js` — or the native program the shim points at, directly.

### Unwanted-behavior (must-not)

- The system shall not pass ORBIS_TOKEN, ORBIS_MASTER_KEY, any bot's secret values or any other bot's run token in the environment of a brain process.
- The system shall not start a run whose brain configuration is incomplete (executable not found, missing base URL for `openai`, missing API key for a remote API); it shall fail the run at once with a message naming the missing piece.
- The system shall not execute tool calls from an API brain turn that stopped on `refusal`, or on `max_tokens` while holding a tool call; the run fails naming the reason.
- The system shall not pass `--force` to the Cursor CLI, so that Cursor's own shell and write tools keep Cursor's permission rules.
- The system shall not read, store or relay the ChatGPT password or tokens (Codex keeps them), nor drive the chatgpt.com website.
- The system shall not ask an API brain for its final answer more than once in a run, a retried request included.
- The system shall not call a `chat-http` API without an address, without a token, or with a JWT token past its expiry; it shall say which, and say that the token expired or is wrong when the server answers 401 or 403.
- The system shall not write a `chat-http` address or token in its code, tests or documentation.

### Optional

- Where a bot selects the `openai` brain with a base URL on localhost (Ollama, LM Studio, vLLM), the system may run it with no API key.
- Where the hub configuration declares an `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` environment variable, the system may use it for bots that name no key secret of their own.

## Acceptance criteria

1. [verified] The mock brain emits `run.started`, `step.text` and `run.finished` in that order for a plain message, and a `step.tool_call`/`step.tool_result` pair when the message asks for a tool — verified by `packages/hub/test/runtimes/mock.test.ts`.
2. [verified] The anthropic adapter, run against a fake Messages API server, executes a `tool_use` block through the gateway, returns a `tool_result`, emits the final text and records input and output tokens — verified by `packages/hub/test/runtimes/anthropic.test.ts`.
3. [verified] The openai adapter, run against a fake Chat Completions server with streaming, executes a function call through the gateway and emits the final text and usage — verified by `packages/hub/test/runtimes/openai.test.ts`.
4. [verified] The claude-code adapter builds argv with `-p`, `--output-format stream-json`, `--mcp-config`, `--permission-prompt-tool` and, on the second run, `--resume <session>`, and turns a fake executable's stream-json output into normalized events — verified by `packages/hub/test/runtimes/claude-code.test.ts`.
5. [verified] The codex, gemini-cli and custom-cli adapters turn their fake executables' output into normalized events — verified by `packages/hub/test/runtimes/cli-harnesses.test.ts`.
6. [verified] A CLI brain's environment holds no ORBIS_TOKEN, no ORBIS_MASTER_KEY and no secret value — verified by `packages/hub/test/runtimes/cli-harnesses.test.ts`.
7. [verified] A brain that exits non-zero or outlives its timeout fails the run and sets the bot to `blocked` — verified by `packages/hub/test/runs.test.ts`.
8. [verified] The health check reports found and missing executables with their versions — verified by `packages/hub/test/runtimes/health.test.ts`.
9. [verified] The cursor adapter runs a fake Cursor CLI with `-p --output-format stream-json --trust --workspace --approve-mcps`, maps its events, resumes the stored chat (or starts a new one when it no longer resumes), writes and restores `.cursor/mcp.json` and `.cursor/cli.json`, and fails with Cursor's error — verified by `packages/hub/test/runtimes/brains-settings.test.ts`.
10. [verified] The ollama and lmstudio brains run against a fake local server at the configured address with no key, and a model that rejects tools answers without them — verified by `packages/hub/test/runtimes/brains-settings.test.ts`.
11. [verified] The brain test answers `answered: true` for a brain that replies 391 and `false` for the mock's echo, names a missing model and leaves no scratch workspace; the local-servers route lists a server's models or says it is not reachable; the health check finds the Cursor CLI under either name — verified by `packages/hub/test/runtimes/brains-settings.test.ts`.
12. [verified] On Windows, an npm `.cmd` shim runs its Node.js script with the prompt as one argument, and a batch file with no script fails naming the fix — verified by `packages/hub/test/runtimes/brains-settings.test.ts`.
13. [verified] With fake `npm` and `codex` executables, the hub reports Codex missing, installs it, starts a device sign-in whose link and code it reports, then the ChatGPT account, signs out, gives the browser sign-in link and reports a cancelled sign-in; the parsers read the output the real Codex CLI prints — verified by `packages/hub/test/runtimes/codex-account.test.ts`.
14. [verified] A run that waits 1.5 s for an approval past its 1 s timeout ends done; an LM Studio bot at its step limit answers in a third request with no tools, and a closed server fails naming the address and ECONNREFUSED; an openai bot with no key fails pointing to its settings; bots start idle after a restart — verified by `packages/hub/test/bot-behaviour.test.ts`.
15. [verified] With the real shim texts, codex.cmd runs its script with node, Claude Code 2's claude.CMD runs claude.exe, npx.cmd runs npx-cli.js, a batch file naming no program is refused, and an MCP server's crash is reported by its error line — verified by `packages/hub/test/runtimes/windows-shims.test.ts`.
16. [verified] A Claude Code run whose approval is answered after its 1 s limit ends done; a gone Claude Code session and a gone Codex thread restart with the earlier conversation in the prompt, and Codex gets the 24-hour tool timeout; a 12,000-character paste goes on stdin; an LM Studio bot retries a 429, runs a tool call ended with `stop` and keeps `<think>` out of its reply — verified by `packages/hub/test/chat-audit.test.ts`.
17. [verified] A resumed Claude Code session gets a colleague's message posted during its last run and not its own reply again; an LM Studio bot whose last request is retried after a 429 is asked once for its final answer — verified by `packages/hub/test/review.test.ts`.
18. [verified] Against a fake orchestrator, a bot posts a multipart `data` field with the Bearer token and Origin, reads a streamed answer and its usage, continues the returned chat with only the new message, uses a tool through a ```tool block, resends the whole run when no chat id comes, starts a new chat when the stored one is refused, reports an expired JWT before calling and a 401 after; answers in SSE, JSON lines, one JSON document and plain text are read; a pasted cURL (bash or cmd) gives the address, token, agent, model and Origin — verified by `packages/hub/test/runtimes/chat-http.test.ts`.

## Maturity

**MVP (committed):**

- Ten adapters, normalized events, session resume for Claude Code, Codex and Cursor, MCP bridge, health check with local model servers, the brain test.

**Future (aspirational, not committed):**

- A model-based reviewer brain for risky actions (auto review).
- Delegating code tasks to remote coding agents on other machines.
- Running a CLI brain on a remote station machine instead of the hub host.

## Out of scope for this spec

- Which tools exist and how they are gated (see `specs/tool-gateway`, `specs/approvals`).
- Cost accounting (see `specs/usage`).
