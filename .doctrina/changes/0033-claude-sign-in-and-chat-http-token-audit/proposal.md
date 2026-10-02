# Change 0033-claude-sign-in-and-chat-http-token-audit — claude sign-in and chat-http token audit

- **Status:** proposed
- **Date:** 2026-10-02
- **Owner:** Claude Code
- **Lane:** runtime (uncertain; signals: diagnosis)
- **Affects specs:** agent-runtimes, web-app
- **Documented surface:** n/a — documented in docs/brains.md with this change

## Why

The project owner pulled and built, then reported two failures on their
Windows machine: the Claude Code card's **Test** failed with "OAuth session
expired" (the refresh failed) and no sign-in screen ever appeared; and a
`chat-http` bot, given only the request address and the Bearer token, got HTTP
403 in the chat. They asked for an audit of whether the token is being saved.

## Audit findings

- Claude Code: the login belongs to the `claude` program and expires; Orbis
  only relayed the error, and (unlike ChatGPT with Codex) had no way to sign
  in. `claude auth status` cannot tell an expired login from a good one, so
  the signal is the failed test.
- Token saving: the path is sound — the settings `PUT` the cleaned token to the
  bot's vault secret, the brain reads it with the same name and sends it (the
  tests prove it end to end), and a bot with no token never reaches the
  server (the check refuses first). So a 403 means the server got a token. What
  was weak: a token pasted as `Authorization: Bearer …`, in quotes or wrapped
  was sent as garbage; nothing showed that a token is saved or until when;
  and the 403 message blamed the token without the server's reason.
- The likely cause of a 403 with a valid token is what the browser sends beside
  it (Origin, Referer, User-Agent) when the owner typed the address and token
  instead of pasting the cURL. Orbis sent only Origin, and only from a cURL.
- A template export kept `chat.origin` and `chat.historyUrl`, the owner's
  private addresses.

## What

- Hub: `ClaudeAccount` (status, login with a stdin code, cancel) over a
  `CliJobs` runner extracted from `CodexAccount`; routes under
  `/runtimes/claude/*`; a sign-in hint on Claude Code login failures.
- Hub `chat-http`: one `Connection` (token, Origin, kept headers) for the
  message, the history and the title; `refusal` explains a 401 and a 403;
  `cleanBearer` (shared, also used by the web and the cURL reader);
  `GET /bots/:id/chat-token`; `chat.headers` in the brain and its schema;
  template export without private addresses.
- Web: `ClaudeSignIn` in the Claude Code card; the token's status and the
  copied headers in the chat-http fields.
- Tests: `claude-account.test.ts`, `chat-http.test.ts` (hub),
  `claude-sign-in.test.tsx`, `chat-http.test.tsx` (web). Docs: `docs/brains.md`,
  CHANGELOG, the hub-surface contract.

## Scope boundaries

- Orbis does not read Claude Code's credentials and does not sign it out: they
  are shared with the owner's own terminal sessions.
- No default `User-Agent` or `Origin` is invented for `chat-http`: only what
  the owner's browser sent is copied, and the error says what is missing.
- A cookie or another header of the cURL (an API key, say) is never stored in
  the bot.

## Verification

- [x] Automated checks pass: `npm run typecheck`, every Vitest project and `npm run build`.
- [x] The affected specs' acceptance criteria are met and cite their evidence (`doctrina coverage`).

## Open questions

None.
