# Change 0086-routine-local-timezone — routine-local-timezone

- **Status:** applied
- **Applied:** 2026-10-25
- **Date:** 2026-10-25
- **Owner:**
- **Lane:** product
- **Affects specs:** bots, routines

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

A new routine starts in the timezone of the user's device, not UTC

## What

The UX audit found new routines in UTC. The web form already defaults to the device's timezone (the audit's
headless browser ran in UTC), but two real gaps sat behind it: a routine a bot creates with `routine.create` and
no timezone ran in UTC, and the bots read the date in the hub's timezone (a container is often UTC), so after 21:00
in Brasília they already thought it was the next day.

- `packages/hub/src/services/user-zone.ts` (new): `GET/PUT /api/v1/me/timezone`, kept in settings `user.timezone`.
- `packages/web/src/App.tsx`: the app tells the hub the device's timezone when it connects.
- `packages/hub/src/context/assemble.ts`: "Today is … (zone); it is HH:MM there" in the user's timezone.
- `packages/hub/src/routines/service.ts`: a routine with no timezone (tool or API) takes the user's.

## Scope boundaries

- A routine's timezone given explicitly stays as given.
- Initiative quiet hours keep their own timezone setting.

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
