# Change 0031-chat-http-history-first — chat-http history first

- **Status:** applied
- **Applied:** 2026-10-02
- **Date:** 2026-10-02
- **Owner:** Claude Code
- **Lane:** product (confident; signals: feature)
- **Affects specs:** agent-runtimes
- **Documented surface:** n/a — documented in docs/brains.md with this change

## Why

The project owner showed what their company chat's history returns for a chat:
`data.chat` with `_id` and `messages`, each with `role`, `content` and
`usage` (`promptTokens`, `completionTokens`). The streamed answer's format
is still unknown, so the history becomes the source of the reply.

## What

- Hub (`brains/chat-http.ts`): after each request the history is read; the
  reply after the sent message and its tokens come from it (once more after
  1.5 s when not saved yet); the stream is the fallback. Chat ids from a
  `chat` object; camelCase token counts.
- Tests: `packages/hub/test/runtimes/chat-http.test.ts` with the same structure and made-up data (no name, e-mail,
  manager or department of the owner).
- Docs: `docs/brains.md`, CHANGELOG.

## Scope boundaries

- The personal fields of the history (the user's profile) are never read.

## Verification

- [x] Automated checks pass: `npm run typecheck`, every Vitest project and `npm run build`.
- [x] The affected specs' acceptance criteria are met and cite their evidence (`doctrina coverage`).

## Open questions

None.
