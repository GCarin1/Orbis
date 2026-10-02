# Change 0023-audit-cycle-1-routines-and-usage — Audit cycle 1 — routines and usage

- **Status:** applied
- **Applied:** 2026-10-02
- **Date:** 2026-10-02
- **Owner:** Claude Code
- **Lane:** product (confident; signals: bug, audit)
- **Affects specs:** routines, usage, web-app

## Why

The project owner asked for five repeated cycles of audit and fix after the
deep audit of change 0022. Cycle 1 reads routines, skills, secrets requests,
spend caps and the handoff edge cases.

## What

- A cron routine faster than its work piled runs up in the bot's queue; a
  scheduled turn is now skipped while the previous run goes on, with one
  `routine.skipped` event.
- A routine run cut by a hub restart showed as running forever; at start the
  hub records how it ended.
- Codex's older event shape reports cumulative token totals; each report was
  added whole. Only what it adds counts now.
- A web-app requirement worded with "could" is restated.
- Tests: `packages/hub/test/audit-cycle1.test.ts`. Docs: CHANGELOG,
  `docs/bot-behaviour-audit.md`.

## Scope boundaries

- Skills, secret requests, spend caps and handoff edge cases (receiver
  failing, cancelled, deleted) were read and found sound; nothing changes there.

## Verification

- [x] Automated checks pass: `npm run typecheck`, every Vitest project and `npm run build`.
- [x] The affected specs' acceptance criteria are met and cite their evidence (`doctrina coverage`).

## Open questions

None.
