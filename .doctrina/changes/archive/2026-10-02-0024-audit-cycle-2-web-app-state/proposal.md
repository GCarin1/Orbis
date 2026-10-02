# Change 0024-audit-cycle-2-web-app-state — Audit cycle 2 — web app state

- **Status:** applied
- **Applied:** 2026-10-02
- **Date:** 2026-10-02
- **Owner:** Claude Code
- **Lane:** product (confident; signals: bug, audit)
- **Affects specs:** web-app

## Why

Cycle 2 of the five audit-and-fix cycles the project owner asked for: the web
app's state — the event stream, the cards, the approvals inbox, the
conversation list and reading aloud.

## What

- The stream had no heartbeat: after a laptop slept or Wi-Fi dropped, a dead
  connection still read "connected" and replies never arrived. It now pings
  every 25 s (and when the network or the window comes back) and replaces a
  connection that does not answer within 10 s, reloading what was missed.
- An approval or draft answer the hub refused (already answered in another
  tab, expired with its run) failed silently and the card stayed pending; it
  now says why and shows the hub's state.
- The approvals inbox showed only the tool name and opened the bot's own
  conversation even for an approval waiting in a group; it now says what the
  call would do and opens the right conversation.
- The conversation list and reading aloud showed and spoke Markdown marks
  (`**`, `#`, backticks); they now use the plain words.
- Tests: `packages/web/test/audit-cycle2.test.tsx`. Docs: CHANGELOG,
  `docs/bot-behaviour-audit.md`.

## Scope boundaries

- The hub's stream is unchanged: it already answers `ping` with `pong`.

## Verification

- [x] Automated checks pass: `npm run typecheck`, every Vitest project and `npm run build`.
- [x] The affected specs' acceptance criteria are met and cite their evidence (`doctrina coverage`).

## Open questions

None.
