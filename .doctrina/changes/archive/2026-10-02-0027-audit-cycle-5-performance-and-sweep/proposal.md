# Change 0027-audit-cycle-5-performance-and-sweep — Audit cycle 5 — performance and sweep

- **Status:** applied
- **Applied:** 2026-10-02
- **Date:** 2026-10-02
- **Owner:** Claude Code
- **Lane:** product (confident; signals: bug, audit, performance)
- **Affects specs:** conversations, web-app

## Why

The last of the five audit-and-fix cycles the project owner asked for: an
adversarial re-read of what changes 0022 to 0026 touched, and what slows the
hub and the chat down as conversations and runs grow.

## What

- Every step of a run rewrote all of the run's steps to the database. With
  node:sqlite being synchronous, a long run (hundreds of steps with large tool
  results) wrote hundreds of megabytes and blocked the hub. Steps are now
  written at most every 250 ms and at the end.
- Lookups every run makes (its reply and cards by run, its approvals, its
  routine record) and the chat's runs of a conversation scanned whole tables;
  database migration 8 indexes them.
- A retried run started a new chain, so its reply woke again a bot
  that already answered the message; it keeps the old run's chain.
- The chat parsed the Markdown of every message again on each step of a
  working bot; messages are memoized.
- The send error stayed after the user edited the message; it clears.
- Tests: `packages/hub/test/audit-cycle5.test.ts`,
  `packages/web/test/audit-cycle5.test.tsx`. Docs: CHANGELOG,
  `docs/bot-behaviour-audit.md`.

## Scope boundaries

- The rest of the earlier cycles' changes were re-read and kept as they are.

## Verification

- [x] Automated checks pass: `npm run typecheck`, every Vitest project and `npm run build`.
- [x] The affected specs' acceptance criteria are met and cite their evidence (`doctrina coverage`).

## Open questions

None.
