# Change 0029-chat-http-brain — chat-http brain

- **Status:** applied
- **Applied:** 2026-10-02
- **Date:** 2026-10-02
- **Owner:** Claude Code
- **Lane:** product (confident; signals: feature)
- **Affects specs:** agent-runtimes, web-app, templates
- **Documented surface:** n/a — the brain is documented in docs/brains.md, README.md and README.pt.md, committed with this change (4800b01) before its close ran

## Why

The project owner uses a company chat in the browser, which they can call with
a cURL command (a Bearer token and a multipart body with a `data` field), and
wants their bots to use it: they give only the request's address and the
token. The address is confidential: it must not be written in Orbis.

## What

- Shared: `chat-http` brain kind, `Brain.chat` options, `parseCurl`
  (bash and Windows cmd formats), `tokenExpiry`.
- Hub: `brains/chat-http.ts` — the request, a tolerant answer reader, chat
  continuation, tools as ```tool blocks, token checks; the brain is resumable
  (chat id per conversation); template export drops its address; API schema.
- Web: `ChatHttpFields` in the new-bot screen and the bot settings; the token
  saved as the bot's secret `CHAT_BEARER_TOKEN`. Saving the bot settings also
  keeps the brain's time and step limits, which it dropped before.
- Tests: `packages/hub/test/runtimes/chat-http.test.ts`, `packages/web/test/chat-http.test.tsx` (made-up addresses and tokens).
- Docs: `docs/brains.md`, READMEs, CHANGELOG, contract hub-surface.

## Scope boundaries

- The orchestrator's answer format was not given (the second cURL shown was
  the chat's title request); the reader accepts the usual shapes and, when it
  finds no text, the run's error shows how the answer began.
- Nothing here contacts the owner's company: tests run against a local fake.

## Verification

- [x] Automated checks pass: `npm run typecheck`, every Vitest project and `npm run build`.
- [x] The affected specs' acceptance criteria are met and cite their evidence (`doctrina coverage`).

## Open questions

- The real answer format: confirm with one real exchange (token removed).
