# Change 0060-bot-initiative — bot-initiative

- **Status:** applied
- **Applied:** 2026-10-07
- **Date:** 2026-10-07
- **Owner:** Orbis maintainers
- **Lane:** product
- **Affects specs:**

<!--
Optional, and usually absent. The closing docs gate reads COMMAND and FLAG
names out of the prose below and asks for documentation when it finds any.
It cannot tell a change from a mention: explaining an effect, or writing a
Scope boundaries line about what this deliberately does NOT touch, names
things just as loudly as changing them would.

When that happens, say so on the record instead of forcing the close:

- **Documented surface:** n/a — names two commands to explain an effect; alters neither

`none` reads the same as `n/a`, and a BARE one silences nothing — the
reason is the declaration.
-->

## Why

Bot initiative: a bot the user lets write on its own asks for tasks when idle, shares insights and alerts, in quiet-hour and daily limits, on or off per bot and for every bot

## What

- Shared: `BotInitiative` on `Bot`, `InitiativeSettings`, the `initiative`
  run trigger.
- Hub: `packages/hub/src/initiative/service.ts` checks every 10 minutes
  which bot may write (its rhythm's quiet, its 24-hour count and gap, the
  user's answer to its last one, quiet hours, every bot's switch, a roll
  of the dice) and starts a silent run in its direct conversation;
  `GET/PUT /initiative`, `POST /bots/:id/initiative/now`. The engine posts
  no `[silent]` reply and says no failure of a silent run. Migration 13:
  `bots.initiative`, table `initiatives`.
- Web: the bot's Initiative fields, Settings → Initiative, the tag above
  a message of initiative.
- Specs: bots, web-app. Docs: `docs/initiative.md`, README, CHANGELOG,
  hub-surface contract.

## Scope boundaries

- MCP server updates reach a bot in change 0061; this change only keeps its
  `mcpUpdates` choice.
- Bots write on their own only in their direct conversation, never in a
  group.

## Verification

<!--
How you will know the change is correctly applied. Use checkboxes: every
box here is a claim that must be PROVEN before the change is done.
`doctrina change archive` refuses to archive while any box below is
unchecked (pass --force to archive anyway and record the gap). Distinguish
"task marked done" from "verification passed" — link the evidence.
-->

- [x] Automated checks pass (`doctrina verify`, or the project's typecheck/test/build).
- [x] The affected spec's acceptance criteria are met and cite their evidence (`doctrina coverage`).

## Open questions

<!-- List unresolved decisions. Empty if none. -->
