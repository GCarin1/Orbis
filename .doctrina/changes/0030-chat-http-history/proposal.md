# Change 0030-chat-http-history — chat-http history

- **Status:** proposed
- **Date:** 2026-10-02
- **Owner:** Claude Code
- **Lane:** product (confident; signals: feature)
- **Affects specs:** agent-runtimes, web-app
- **Documented surface:** n/a — documented in docs/brains.md with this change

## Why

The project owner sent the other requests their company chat makes after a
message: a GET of one chat's history (`…/history/chats/<id>`) and a GET of
the newest chats (`…/history/chats?page=1…`). The answer's own format is
still unknown; the history gives Orbis a second way to the reply and to the
chat id, without guessing.

## What

- Hub (`brains/chat-http.ts`): the history address (beside the request
  address, or the bot's `chat.historyUrl`); reading a chat's messages in the
  usual shapes; the reply after the sent message; the newest chats searched
  for the one holding it; a failing history asked once per run.
- Shared: `ParsedCurl.hasBody` and `historyUrl`; `ChatHttpOptions.historyUrl`.
- Web: a pasted GET cURL renews the token (and sets the history address)
  without replacing the request address; Advanced shows the history address.
- Tests: `packages/hub/test/runtimes/chat-http.test.ts`, `packages/web/test/chat-http.test.tsx` (made-up addresses and tokens).
- Docs: `docs/brains.md`, contract hub-surface, CHANGELOG.

## Scope boundaries

- No address of the owner's company is written anywhere; paths are derived
  from the address the user gives.

## Verification

- [x] Automated checks pass: `npm run typecheck`, every Vitest project and `npm run build`.
- [x] The affected specs' acceptance criteria are met and cite their evidence (`doctrina coverage`).

## Open questions

- The real answer and history formats: confirm with one real exchange.
