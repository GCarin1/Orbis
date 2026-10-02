# Tasks — Change 0033-claude-sign-in-and-chat-http-token-audit

<!--
Each task is a single checkable item. Keep tasks small (under a few hours
of work). The change is done when every box is checked and
`doctrina close 0033-claude-sign-in-and-chat-http-token-audit` succeeds — the close applies the deltas,
archives the change and updates the index, so those are not boxes here.
-->

- [x] Audit: the token's path (settings → vault → brain → request), the Claude Code test failure, the template export.
- [x] Hub: `CliJobs` extracted; `ClaudeAccount`, its routes and the sign-in hint on login failures.
- [x] Hub chat-http: `Connection` and `requestHeaders`, `refusal`, `cleanBearer`, `chat-token` route, `chat.headers`, template privacy.
- [x] Web: `ClaudeSignIn`, the token status and the copied headers; pt/en texts.
- [x] Tests: hub (chat-http, claude-account) and web (claude-sign-in, chat-http).
- [x] Docs: `docs/brains.md`, CHANGELOG, the hub-surface contract.
