# Spec Delta — capability: handoff

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/handoff/spec.md`

---

```ops
set-header Implementation: verified — handoff tool (to a handle, or a role one bot holds), cards, threaded replies, one report back per delegating run, bot.report events, bot-to-bot mentions in any conversation, depth limit
bump-version minor
replace-requirement ubiquitous 1: The system shall provide the `team.handoff` tool with the inputs `to` (a bot handle, or a role that exactly one bot holds), `task` (text), and the optional `context` (text) and `returnResult` (boolean, default true).
replace-requirement ubiquitous 4: The system shall limit each chain of bot-triggered runs (handoffs, reports back and bot-to-bot mentions) to a depth of 6, set by ORBIS_MAX_HANDOFF_DEPTH.
replace-requirement event 3: When every handoff with `returnResult` that one run of a bot made has ended as done or failed, the system shall start one run of that bot, triggered as `report`, in the conversation of the handoffs, whose input holds each receiver's answer or failure and asks the bot to tell the user the outcome.
append-requirement event: When a `report` run finishes with a reply, the system shall post the reply as a new message of the conversation, not a thread reply, and broadcast a `bot.report` event naming the bot, the conversation, the item and the text.
append-requirement unwanted: The system shall not start runs for the bots that a `report` run's reply mentions, for the bots the replying run handed work to, or for the bot that handed the replying run its task.
append-requirement unwanted: The system shall not accept a handoff to a role that several bots hold; it shall answer with their handles.
append-criterion [verified] A run that hands off to two bots wakes its bot once, as a `report` run, after both ended, with the answer of one and the failure of the other; the report is a new message, a `bot.report` event names it, and the report's mentions start no one — verified by `packages/hub/test/team.test.ts`.
append-criterion [verified] A handoff to a role reaches the one bot holding it, and a role two bots hold is refused naming both — verified by `packages/hub/test/team.test.ts`.
```
