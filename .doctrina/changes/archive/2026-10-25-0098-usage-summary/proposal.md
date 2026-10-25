# Change 0098-usage-summary — usage-summary

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

Usage shows three headline numbers and money in the user's format

## What

The audit found the Usage screen a table of raw numbers: dollars in English format, a tokens column most people do not need, an empty Subscription column and "no cap" with no way to set one.

- `UsageScreen.tsx`: three headline numbers (the month's cost, runs, the bot that spent the most); money in the user's own format ("US$ 1.234,50" in Portuguese — still dollars, Orbis converts nothing); tokens behind "Show tokens"; the Subscription column only when something was billed to one; "Set a limit" opens the bot's settings.
- `App.tsx`: wires Set a limit to the bot's settings panel.

## Scope boundaries

- Costs stay in US dollars as the hub reports them; no exchange rate is fetched.

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
