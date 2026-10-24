# Change 0085-reply-style-feedback — reply-style-feedback

- **Status:** applied
- **Applied:** 2026-10-24
- **Date:** 2026-10-24
- **Owner:**
- **Lane:** product (uncertain; signals: change)
- **Affects specs:** conversations, web-app

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

Switching a conversation's reply style shows its state and takes effect: the menu shows on/off switches, the chat records the change, and every reply in chat style is told to be short in its task

## What

The user turned on short replies in a group and the next answers were still long; switching to detailed showed
nothing, so they could not tell whether it worked. The menu named the opposite action ("Detailed replies" while
short was on) and the reminder lived only in the system text, which a long conversation of long answers outweighs.

- `packages/hub/src/collab/backstage.ts`: the style route posts `conversation.style` / `conversation.backstage`
  events; `taskNote(run)` adds the short-reply reminder at the end of the task (engine preparer).
- `packages/web/src/components/MenuSwitch.tsx` (new): on/off switch items in the group and bot menus.
- `packages/web/src/components/Timeline.tsx`: the style events as chat lines.

## Scope boundaries

- No hard cut of long replies: the bot is told, not truncated.

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
