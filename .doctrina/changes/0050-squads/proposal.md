# Change 0050-squads — squads

- **Status:** proposed
- **Date:** 2026-10-03
- **Owner:** Claude Code
- **Lane:** product
- **Affects specs:** squads, routines, handoff
- **Documented surface:** n/a — documented in docs/squads.md, docs/skills-and-routines.md and docs/api.md with this change

## Why

The owner asked to organize bots by squad.
- A squad has a name, and each bot belongs to one.
- Each squad has a representative. A representative has a manager, and one
  manager may take every squad.
- Squads talk and work with each other.
- Each bot's routines can be called by other bots.

## What

- Hub:
  - `squads/service.ts`:
    - squads, members, representative, manager, and one manager for all;
    - who reports to whom, checked for loops;
    - the squads' groups and the room;
    - `@squad` aliases, the squads' context, `team.list_squads`, routes and
      `squads.updated`;
    - leaving and deletion.
  - Migration 11: `squads`, `bots.squad_id`, `routine_runs.called_by`.
  - `resolveMentions` takes aliases.
  - `team.handoff`'s core became `delegate`, which `routine.call` also uses.
  - `routine.list` gains `bot: "all"`, and `team.list_bots` gives each bot's
    squad.
- Web:
  - `SquadsScreen.tsx`: the org chart, squad cards, the bots in no squad, a
    new squad, one manager for all, the room.
  - The sidebar's squad filter, and squad dots.
  - The squad field in bot settings, with "reports to" set by the squad.
  - The routines panel shows how other bots call a routine and who called
    it.
- Product: SC12. Spec: the new `squads` capability, deltas to `routines` and
  `handoff`. ADR 0016.
- Tests:
  - `packages/hub/test/squads.test.ts`
  - `packages/web/test/squads.test.tsx`
  - `tests/e2e/squads.test.ts`
  - the phone sweep
- Docs: `docs/squads.md`, `docs/skills-and-routines.md`, `docs/api.md`, the
  READMEs, CHANGELOG, the contract.

## Scope boundaries

- No squads inside squads, and no budget per squad: future work in the spec.
- A squad's chat holds at most `ORBIS_MAX_GROUP_SIZE` bots.

## Verification

- [x] Automated checks pass: `npm run typecheck`, every Vitest project (the e2e included), `npm run build`.
- [x] The affected specs' acceptance criteria are met and cite their evidence (`doctrina coverage`).

## Open questions

None.
