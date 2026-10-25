# Change 0091-chat-focus — chat-focus

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

The chat keeps to the conversation: bot panel closed by default, steps and read-aloud on one line under the message, a simpler composer

## What

The audit found the chat crowded: the bot panel open by default with a big screen preview, a brain chip and "Idle" in the header, "Ver 1 passos" far from its message, and five controls in the message box.

- `App.tsx`: the panel opens only when asked (remembered).
- `BotPanel.tsx`: team, routines, the computer (its screen only while it runs, else one line), the brain.
- `BotHeader.tsx`: name and role; the state only while the bot works.
- `Timeline.tsx`: listen and "1 step / N steps" on one line under the message (also fixes the listen button stretched across the bubble in dark mode).
- `Composer.tsx`: one + (attach, mention, read aloud), placeholder "Message".

## Scope boundaries

- Nothing beyond the screens named.

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
