# Spec Delta — capability: agent-runtimes

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/agent-runtimes/spec.md`

---

```ops
bump-version minor
replace-requirement event 5: When a brain process exits with a non-zero status, or a run works longer than its timeout (default 15 minutes), not counting the time it waits for the user's approval or answer, the system shall stop the process, mark the run failed with the error text and set the bot state to `blocked`.
append-requirement event: When an API brain (openai, anthropic, ollama, lmstudio) reaches its last allowed step, the system shall send that request without tools and ask the model to answer with what it found.
append-requirement event: When an API brain cannot reach its server, the system shall fail the run naming the address, the network error code and the server to start.
append-requirement event: When a bot's brain is not ready (no API key, no CLI), the system shall fail its run with the reason and a pointer to that bot's settings.
append-requirement event: When the hub starts, the system shall set every bot whose state is neither `idle` nor `done` to `idle`.
append-requirement state: While the hub runs on Windows, the system shall run an npm `.cmd` shim without cmd.exe: its Node.js script with node — for npm's own npx.cmd and npm.cmd the `*-cli.js` script, not `npm-prefix.js` — or the native program the shim points at, directly.
append-criterion [verified] A run that waits 1.5 s for an approval past its 1 s timeout ends done; an LM Studio bot at its step limit answers in a third request with no tools, and a closed server fails naming the address and ECONNREFUSED; an openai bot with no key fails pointing to its settings; bots start idle after a restart — verified by `packages/hub/test/bot-behaviour.test.ts`.
append-criterion [verified] With the real shim texts, codex.cmd runs its script with node, Claude Code 2's claude.CMD runs claude.exe, npx.cmd runs npx-cli.js, a batch file naming no program is refused, and an MCP server's crash is reported by its error line — verified by `packages/hub/test/runtimes/windows-shims.test.ts`.
```
