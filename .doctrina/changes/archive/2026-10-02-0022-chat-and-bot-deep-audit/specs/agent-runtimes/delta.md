# Spec Delta — capability: agent-runtimes

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/agent-runtimes/spec.md`

---

```ops
bump-version minor
append-requirement ubiquitous: The system shall stop a CLI brain's process at the run's time limit only through the run's own clock, which does not count the time the run waits for the user; the process has no wall-clock limit of its own.
append-requirement ubiquitous: The system shall send a CLI brain a prompt longer than 8,000 characters on its standard input instead of its command line (Claude Code `-p` with no prompt argument, Codex `-`).
append-requirement event: When a stored Claude Code, Codex or Cursor session can no longer be resumed, the system shall start a new session with the whole recent conversation, not only what came after the last run.
append-requirement event: When the Codex CLI or the Gemini CLI starts the Orbis MCP server, the system shall set its tool timeout to 24 hours, so a call waiting for the user's approval is not abandoned.
append-requirement event: When an OpenAI-compatible server answers 429, 500, 502, 503 or 504, the system shall wait for its Retry-After (at most 30 s) or 2 s then 6 s, and send the same step again up to twice.
append-requirement event: When an OpenAI-compatible server returns tool calls, the system shall run them whatever finish reason it gives, and when a reply holds `<think>` blocks, the system shall show them as thinking and leave them out of the reply.
append-requirement ubiquitous: The system shall tell every bot today's date and the hub's time zone, and to answer in the language the user writes in.
append-criterion [verified] A Claude Code run whose approval is answered after its 1 s limit ends done; a gone Claude Code session and a gone Codex thread restart with the earlier conversation in the prompt, and Codex gets the 24-hour tool timeout; a 12,000-character paste goes on stdin; an LM Studio bot retries a 429, runs a tool call ended with `stop` and keeps `<think>` out of its reply — verified by `packages/hub/test/chat-audit.test.ts`.
```
