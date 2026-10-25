# Change 0092-settings-groups — settings-groups

- **Status:** applied
- **Applied:** 2026-10-25
- **Date:** 2026-10-25
- **Owner:**
- **Lane:** product (confident; signals: add)
- **Affects specs:** web-app
- **Documented surface:** n/a — this change's docs (docs/android.md, docs/voice.md, docs/brains.md, docs/mcp.md and the CHANGELOG entry for 0089–0093) were committed with its implementation in 81c19b4

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

Settings in four groups, and brains show only those in use plus Add brain

## What

The audit found nine settings tabs in one overflowing row and the brains tab opening with a setup card and red "Not found" badges.

- `SettingsScreen.tsx`: the tabs in four groups (Bots, Conversations, Account and devices, Data), a side list on a computer, a row with dividers on a phone; Brains: your bots first, the brains ready, then **Add a brain** (ChatGPT, chat tokens, what is not installed or running); paths under Details.
- `i18n.ts`: "Not installed" instead of "Not found".

## Scope boundaries

- The tabs keep their names and ids.

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
