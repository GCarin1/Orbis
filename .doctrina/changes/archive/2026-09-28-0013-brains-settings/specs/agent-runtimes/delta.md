# Spec Delta — capability: agent-runtimes

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/agent-runtimes/spec.md`

---

```ops
set-header Implementation: verified — ten adapters (mock, anthropic, openai, ollama, lmstudio, claude-code, codex, gemini-cli, cursor, custom-cli), normalized events, session resume for Claude Code, Codex and Cursor, MCP bridge, health check with the local model servers, the brain test, Windows .cmd shims
bump-version minor
replace-requirement ubiquitous 1: The system shall run every bot turn through the brain adapter selected in the bot's brain configuration, one of `mock`, `anthropic`, `openai`, `ollama`, `lmstudio`, `claude-code`, `codex`, `gemini-cli`, `cursor` or `custom-cli`.
replace-requirement ubiquitous 4: The system shall run the CLI brains (`claude-code`, `codex`, `gemini-cli`, `cursor`, `custom-cli`) as child processes whose working directory is the bot's computer workspace and which authenticate with the CLI's own login, with no API key supplied by Orbis.
append-requirement ubiquitous: The system shall run the `ollama` and `lmstudio` brains through the OpenAI-compatible adapter at the bot's base URL, else at ORBIS_OLLAMA_URL (default `http://127.0.0.1:11434/v1`) or ORBIS_LMSTUDIO_URL (default `http://127.0.0.1:1234/v1`), with no API key unless the bot names a key secret.
append-requirement ubiquitous: The system shall start a Windows `.cmd` or `.bat` CLI brain by running the Node.js script that file points to, so that a multi-line prompt reaches the CLI as one argument.
replace-requirement event 6: When a user requests the brain health check, the system shall report for each CLI brain (`claude-code`, `codex`, `gemini-cli`, `cursor`) whether its executable is found on PATH and the version it prints, and for each local model server (`ollama`, `lmstudio`) whether it answers and the models it serves.
append-requirement event: When a `cursor` run finishes, the system shall store the Cursor chat id for that bot and conversation and pass it with `--resume` on the bot's next run in the same conversation.
append-requirement event: When a `cursor` run starts with the MCP bridge, the system shall write the Orbis MCP server into the workspace's `.cursor/mcp.json`, allow `Mcp(orbis:*)` in the workspace's `.cursor/cli.json`, and restore both files when the run ends.
append-requirement event: When a local model server answers that the model does not support tools, the system shall retry the turn once without tools and record that as a thinking step.
append-requirement event: When a user requests a brain test for a bot or a brain configuration, the system shall ask that brain "What is 17 × 23? Answer with the number only." with no tools, no history and a scratch working directory, and report whether it ran, its reply, its duration and whether the reply holds 391.
append-requirement unwanted: The system shall not pass `--force` to the Cursor CLI, so that Cursor's own shell and write tools keep Cursor's permission rules.
append-criterion [verified] The cursor adapter runs a fake Cursor CLI with `-p --output-format stream-json --trust --workspace --approve-mcps`, maps its events, resumes the stored chat (or starts a new one when it no longer resumes), writes and restores `.cursor/mcp.json` and `.cursor/cli.json`, and fails with Cursor's error — verified by `packages/hub/test/runtimes/brains-settings.test.ts`.
append-criterion [verified] The ollama and lmstudio brains run against a fake local server at the configured address with no key, and a model that rejects tools answers without them — verified by `packages/hub/test/runtimes/brains-settings.test.ts`.
append-criterion [verified] The brain test answers `answered: true` for a brain that replies 391 and `false` for the mock's echo, names a missing model and leaves no scratch workspace; the local-servers route lists a server's models or says it is not reachable; the health check finds the Cursor CLI under either name — verified by `packages/hub/test/runtimes/brains-settings.test.ts`.
append-criterion [verified] On Windows, an npm `.cmd` shim runs its Node.js script with the prompt as one argument, and a batch file with no script fails naming the fix — verified by `packages/hub/test/runtimes/brains-settings.test.ts`.
```
