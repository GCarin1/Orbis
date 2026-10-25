# Change 0097-squads-tidy — squads-tidy

- **Status:** applied
- **Applied:** 2026-10-25
- **Date:** 2026-10-25
- **Owner:**
- **Lane:** product
- **Affects specs:** web-app

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

Squads: the org chart at the centre, rare actions in a menu

## What

The audit found the org chart the best part of the Squads screen but inert, the rare "one manager for every squad" always on screen, a manager select on every card and "bots: 2".

- `SquadsScreen.tsx`: a squad in the chart jumps to its card; "One manager for every squad" moves to the screen's ⋮ menu; each card says its manager as text with Change opening the select; "+ Add a bot" is one select; counts read "2 bots" / "1 bot"; the help is one line.

## Scope boundaries

- The squads routes and rules (representative, manager, chats) are unchanged.

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
