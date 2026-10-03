# Spec Delta — capability: agent-runtimes

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/agent-runtimes/spec.md`

---

```ops
bump-version minor
set-header Realizes: SC2, SC13
set-header Implementation: verified — ten adapters (mock, anthropic, openai, ollama, lmstudio, claude-code, codex, gemini-cli, cursor, custom-cli), normalized events, session resume for Claude Code, Codex and Cursor, MCP bridge, health check with the local model servers, the brain test, Windows .cmd shims, Claude Code on the plan's token from `claude setup-token`
replace-requirement ubiquitous 16: The system shall report Claude Code's account (`claude auth status`), start its sign-in (`claude auth login`) from the settings screen and type the code the sign-in page shows to the waiting command, one sign-in at a time, and shall keep no credential of Claude Code other than the subscription token the user saves.
append-requirement event: When the user saves the token that `claude setup-token` prints, the system shall keep it encrypted with the hub's secrets, answer only whether it is saved, where it comes from, when it was saved and until about when it lasts (one year), and give it to Claude Code as `CLAUDE_CODE_OAUTH_TOKEN` in every `claude-code` run, brain test and account check, in place of Claude Code's sign-in.
append-requirement event: When a `claude-code` run or brain test that had the subscription token fails because Claude Code reports its login refused, the system shall add to the error to run `claude setup-token` again and replace the token in Orbis.
append-requirement unwanted: The system shall not give the Claude subscription token to a brain other than `claude-code`, to Claude Code's sign-in or to a bot's commands, shall not accept an Anthropic API key (`sk-ant-api…`) as that token, and shall not pass `ANTHROPIC_API_KEY` or `ANTHROPIC_AUTH_TOKEN` to Claude Code.
append-requirement optional: Where the hub's environment sets `CLAUDE_CODE_OAUTH_TOKEN` and no token is saved, the system may give Claude Code that token, and where a bot has a secret named `CLAUDE_CODE_OAUTH_TOKEN`, the system may give Claude Code that bot's token instead.
append-criterion [verified] A pasted token is taken bare, from an export line, quoted or wrapped, and an API key is refused; the saved token wins over the server's; a fake Claude Code gets it as CLAUDE_CODE_OAUTH_TOKEN in runs and the brain test with no ANTHROPIC_API_KEY even when the hub has one, a bot's own token secret comes first, a refused token says to run claude setup-token again, and neither the other brains nor host commands get it — verified by `packages/hub/test/runtimes/claude-token.test.ts`.
append-criterion [verified] A fake Claude Code reports the account with the saved token, and its sign-in runs without the token — verified by `packages/hub/test/runtimes/claude-account.test.ts`.
```
