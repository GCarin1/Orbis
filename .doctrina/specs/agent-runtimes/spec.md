# Spec — agent-runtimes

**Capability:** agent-runtimes
**Status:** active
**Implementation:** planned — in progress: the mock brain, the claude-code and custom-cli adapters without tools, the scrubbed environment and run failure are verified since change 0001; MCP wiring lands in change 0002, API brains, codex, gemini-cli and the health check in the brains change
**Realizes:** SC2
**Depends on:** bots, tool-gateway, memory
**Last updated:** 2026-09-27
**Version:** 0.2.0

## Purpose

A brain is what thinks for a bot. Orbis lets each bot pick its brain: a paid
model API, a local model behind an OpenAI-compatible server, or an agent CLI
the user already pays for through a subscription (Claude Code, Codex, Gemini
CLI) driven headless with no API key. Every brain is wrapped by an adapter
that turns its output into one normalized event stream, so the rest of Orbis
never knows which brain ran. The exact argv and output formats of each CLI
brain are owned by `contracts/cli-harnesses`.

## Requirements (EARS)

### Ubiquitous

- The system shall run every bot turn through the brain adapter selected in the bot's brain configuration, one of `mock`, `anthropic`, `openai`, `claude-code`, `codex`, `gemini-cli` or `custom-cli`.
- The system shall translate every brain's output into the normalized events `run.started`, `step.thinking`, `step.text`, `step.tool_call`, `step.tool_result`, `run.usage`, `run.finished` and `run.failed`.
- The system shall build the input of every brain from the bot's identity and description, the context assembled by `specs/memory`, the invoked skill when there is one, and the task of the moment.
- The system shall run the CLI brains (`claude-code`, `codex`, `gemini-cli`, `custom-cli`) as child processes whose working directory is the bot's computer workspace and which authenticate with the CLI's own login, with no API key supplied by Orbis.
- The system shall connect every CLI brain that supports MCP to the Orbis tool gateway through the `orbis mcp` stdio bridge, authenticated with a run token, so that CLI brains and API brains reach the same tools.
- The system shall run the `mock` brain deterministically from its input, with no network access, for tests and demos.

### Event-driven

- When an API brain (`anthropic` or `openai`) returns tool calls, the system shall execute each one through the tool gateway and send the results back to the brain, repeating until the brain ends its turn or the run reaches its step limit (default 25 steps).
- When a `claude-code` run finishes, the system shall store the Claude Code session id for that bot and conversation and pass it with `--resume` on the bot's next run in the same conversation.
- When a `codex` run finishes, the system shall store the Codex thread id for that bot and conversation and resume it on the bot's next run in the same conversation.
- When Claude Code asks for permission to use one of its built-in tools, the system shall decide through `specs/approvals` by serving the MCP tool named in `--permission-prompt-tool`.
- When a brain process exits with a non-zero status, or a run exceeds its timeout (default 15 minutes), the system shall stop the process, mark the run failed with the error text and set the bot state to `blocked`.
- When a user requests the brain health check, the system shall report for each CLI brain whether its executable is found on PATH and the version it prints.

### Unwanted-behavior (must-not)

- The system shall not pass ORBIS_TOKEN, ORBIS_MASTER_KEY, any bot's secret values or any other bot's run token in the environment of a brain process.
- The system shall not start a run whose brain configuration is incomplete (executable not found, missing base URL for `openai`, missing API key for a remote API); it shall fail the run at once with a message naming the missing piece.

### Optional

- Where a bot selects the `openai` brain with a base URL on localhost (Ollama, LM Studio, vLLM), the system may run it with no API key.
- Where the hub configuration declares an `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` environment variable, the system may use it for bots that name no key secret of their own.

## Acceptance criteria

1. [verified] The mock brain emits `run.started`, `step.text` and `run.finished` in that order for a plain message, and a `step.tool_call`/`step.tool_result` pair when the message asks for a tool — verified by `packages/hub/test/runtimes/mock.test.ts`.
2. [unverified] The anthropic adapter, run against a fake Messages API server, executes a `tool_use` block through the gateway, returns a `tool_result`, emits the final text and records input and output tokens — verified by `packages/hub/test/runtimes/anthropic.test.ts`.
3. [unverified] The openai adapter, run against a fake Chat Completions server with streaming, executes a function call through the gateway and emits the final text and usage — verified by `packages/hub/test/runtimes/openai.test.ts`.
4. [unverified] The claude-code adapter builds argv with `-p`, `--output-format stream-json`, `--mcp-config`, `--permission-prompt-tool` and, on the second run, `--resume <session>`, and turns a fake executable's stream-json output into normalized events — verified by `packages/hub/test/runtimes/claude-code.test.ts`.
5. [unverified] The codex, gemini-cli and custom-cli adapters turn their fake executables' output into normalized events — verified by `packages/hub/test/runtimes/cli-harnesses.test.ts`.
6. [verified] A CLI brain's environment holds no ORBIS_TOKEN, no ORBIS_MASTER_KEY and no secret value — verified by `packages/hub/test/runtimes/cli-harnesses.test.ts`.
7. [verified] A brain that exits non-zero or outlives its timeout fails the run and sets the bot to `blocked` — verified by `packages/hub/test/runs.test.ts`.
8. [unverified] The health check reports found and missing executables with their versions — verified by `packages/hub/test/runtimes/health.test.ts`.

## Maturity

**MVP (committed):**

- Seven adapters, normalized events, session resume for Claude Code and Codex, MCP bridge, health check.

**Future (aspirational, not committed):**

- A model-based reviewer brain for risky actions (auto review).
- Delegating code tasks to remote coding agents on other machines.
- Running a CLI brain on a remote station machine instead of the hub host.

## Out of scope for this spec

- Which tools exist and how they are gated (see `specs/tool-gateway`, `specs/approvals`).
- Cost accounting (see `specs/usage`).
