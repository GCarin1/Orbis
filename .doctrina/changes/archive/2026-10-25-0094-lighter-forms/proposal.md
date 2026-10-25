# Change 0094-lighter-forms — lighter-forms

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

Forms read lighter: typed text in normal weight, no repeated labels, bot settings in tabs

## What

The audit found the bot's settings heavy: every typed value in bold under a bold label, "Brain" said twice (legend and label), a grey locked select for whom a squad member answers to, and ten colours and eight shapes always open.

- `styles.css`: inputs, selects and textareas type in normal weight whatever their label's weight.
- `BotSettings.tsx`: chips that jump to Identity, Brain, Tools and Advanced; the brain select named only by its legend; "Reports to" as text ("Ana, through the Growth squad") when the squad decides; the face shown with "Change colour and shape" opening the pickers.

## Scope boundaries

- The new-bot screen keeps its open pickers: choosing a face is part of making a bot.
- No field moves or goes away; the jump chips only scroll.

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
