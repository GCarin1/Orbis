# Change 0014-team-hierarchy — team-hierarchy

- **Status:** applied
- **Applied:** 2026-09-28
- **Date:** 2026-09-28
- **Owner:** Claude Code
- **Lane:** product (confident; signals: collaboration)
- **Affects specs:** handoff, bots, conversations, cli, desktop-app

## Why

The project owner wants bots that work as a team with a hierarchy: asking the
"chief" should make it delegate to its subordinates and come back on its own
when they are done; bots should talk to each other without the user relaying
every message; and the user wants to mention a function (a role), not only a
handle. Until now a handoff woke its sender once per receiver and only when
the sender asked for it, bots only answered mentions inside groups (members
only), and nothing modelled who reports to whom.

## What

- `Bot.reportsTo` (migration 3, `reports_to` column): set on create and edit
  by id or handle, `null` clears; no self, no unknown bot, no reporting loop;
  a deleted manager's reports move up to its own manager; duplicates keep it.
- Every bot's prompt gets a team section (manager, reports, colleagues with
  roles, how to delegate and mention).
- `team.handoff`: `to` accepts a role one bot holds; `returnResult` defaults
  to true; every handoff of one run forms a batch, and once all have ended the
  sender runs once more (new trigger `report`) with every answer and failure,
  posting a top-level message and a `bot.report` stream event.
- Mentions resolve handles and roles (`resolveMentions`, `roleSlug` in
  `@orbis/shared`): in groups the mentioned bots run, members or not; a bot's
  reply in any conversation starts the colleagues it mentions — except the
  bots it just handed work to, the bot that handed it its task, and in a
  report. Direct conversations keep running their own bot, which coordinates.
- `ORBIS_MAX_HANDOFF_DEPTH` default 4 → 6 (three levels with reports back).
- CLI: `bots create|edit --reports-to`, manager shown in `bots list|show`;
  `orbis chat` follows report runs.
- Desktop: a native notification per `bot.report`.
- Contract hub-surface (Bot, Run trigger, handoff card, stream event,
  variable and budget), `.env.example`, docs `collaboration.md`, `api.md`,
  `cli.md`, CHANGELOG.

## Scope boundaries

- The web app's hierarchy editor, unread markers and the new look belong to
  change 0015; this change only adds the data and behaviour they show.
- Templates do not carry `reportsTo` (a template is one bot; its manager is
  another bot of the installation).

## Verification

- [x] Automated checks pass (`doctrina verify`), including the new hub, CLI and desktop tests.
- [x] The affected specs' acceptance criteria cite their evidence (`doctrina coverage --strict`).

## Open questions

- None.
