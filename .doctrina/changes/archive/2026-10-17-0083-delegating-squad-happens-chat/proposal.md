# Change 0083-delegating-squad-happens-chat — Delegating to a squad happens in the squad's chat: the task is posted there, the squad works there, and the answer comes back to the sender

- **Status:** applied
- **Applied:** 2026-10-17
- **Date:** 2026-10-17
- **Owner:**
- **Lane:** product
- **Affects specs:** squads, handoff

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

Delegating to a squad happens in the squad's chat: the task is posted there, the squad works there, and the answer comes back to the sender

## What

The user asked that a chief told to talk to or give orders to a squad really delegate to the squad: today a
handoff runs the receiver in the sender's conversation, so the squad's bot shows up in the chief's chat and
the squad's own chat stays empty.

- `packages/hub/src/collab/handoff.ts`: `team.handoff` to a squad (`@handle`, its representative) or to one of
  its bots that is not in the sender's conversation posts the sender's message in the squad's chat and runs
  the receiver there; the card stays with the sender, naming the squad (`roomId`, `squad`, `roomItemId`).
  A handed-off bot that hands parts on answers with its report (`answerRunId`), so the sender hears the
  squad's final answer. A reply's `@bot` of a squad from outside the conversation becomes such a handoff.
- `packages/hub/src/squads/service.ts`: `roomOf(bot)`; the manager's and representative's context say how.
- `packages/hub/src/collab/backstage.ts`: a task brought to the squad's chat is that chat's own work (in sight).
- `packages/hub/src/services/conversations.ts`: a retried squad task answers under the message in the squad's chat.
- `packages/web/src/components/Cards.tsx`: the card names the squad and opens its chat.

## Scope boundaries

- `routine.call` keeps running in the caller's conversation.
- A user's own @mention in a group still calls that bot into the group: the user chose it.
- A bot that is a member of the conversation (a group with the chief and the bot) works there.

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
