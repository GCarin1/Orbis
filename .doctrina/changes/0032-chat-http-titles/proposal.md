# Change 0032-chat-http-titles — chat-http titles

- **Status:** proposed
- **Date:** 2026-10-02
- **Owner:** Claude Code
- **Lane:** product (confident; signals: feature)
- **Affects specs:** agent-runtimes, web-app
- **Documented surface:** n/a — documented in docs/brains.md with this change

## Why

The project owner asked for the call the browser makes after a chat's first
message: `POST …/history/chats/<chat id>/generate-title` with
`{"data":{"userMessage":"…"}}`. Without it, the chats a bot opens show
untitled in the company chat's list.

## What

- Hub (`brains/chat-http.ts`): `generateTitle` and `titleMessage`; a run that
  opens a chat asks for its title once, in the background, with the message
  "Orbis · <bot> — <task>" (the bot's chats are easy to tell apart). A failure
  is ignored.
- Shared types and API schema: `chat.titles` (default on).
- Web (`ChatHttpFields.tsx`, i18n): a box in Advanced to turn titles off.
- Tests: `packages/hub/test/runtimes/chat-http.test.ts`, `packages/web/test/chat-http.test.tsx` (made-up addresses and tokens).
- Docs: `docs/brains.md`, CHANGELOG, the hub-surface contract's `Brain`.

## Scope boundaries

- The title the server generates is not read back; Orbis keeps its own
  conversation names.
- Chats a bot continues (an id it already holds) get no new title.

## Verification

- [x] Automated checks pass: `npm run typecheck`, every Vitest project and `npm run build`.
- [x] The affected specs' acceptance criteria are met and cite their evidence (`doctrina coverage`).

## Open questions

None.
