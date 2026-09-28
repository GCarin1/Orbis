# Spec — handoff

**Capability:** handoff
**Status:** active
**Implementation:** verified — handoff tool (to a handle, or a role one bot holds), cards, threaded replies, one report back per delegating run, bot.report events, bot-to-bot mentions in any conversation, depth limit
**Realizes:** SC4
**Depends on:** conversations, agent-runtimes, tool-gateway
**Last updated:** 2026-09-27
**Version:** 0.3.0

## Purpose

Bots cooperate by passing work to each other asynchronously. A handoff wakes
the receiving bot with a task; the receiver works and answers later; the
passage stays visible in the conversation. A manager (the bot others report
to, or a group's lead) plays chief of staff: it delegates to its reports and,
once everything it handed off has ended, comes back to the user on its own
with the outcome. A depth limit stops bots from bouncing work between
themselves forever.

## Requirements (EARS)

### Ubiquitous

- The system shall provide the `team.handoff` tool with the inputs `to` (a bot handle, or a role that exactly one bot holds), `task` (text), and the optional `context` (text) and `returnResult` (boolean, default true).
- The system shall show every handoff in the conversation where it was made as a handoff card naming the sender, the receiver, the task and the handoff state (`queued`, `running`, `done` or `failed`).
- The system shall let a group name one lead bot, and treat the group's first member as lead when none is named.
- The system shall limit each chain of bot-triggered runs (handoffs, reports back and bot-to-bot mentions) to a depth of 6, set by ORBIS_MAX_HANDOFF_DEPTH.

### Event-driven

- When a bot calls `team.handoff`, the system shall queue a run for the receiving bot carrying the task and context, and return to the caller at once an acknowledgment with the handoff id, without waiting for the receiver.
- When the receiving bot's handoff run finishes, the system shall post its reply as a thread reply to the handoff card and set the card state to `done`.
- When every handoff with `returnResult` that one run of a bot made has ended as done or failed, the system shall start one run of that bot, triggered as `report`, in the conversation of the handoffs, whose input holds each receiver's answer or failure and asks the bot to tell the user the outcome.
- When the receiving bot is deleted before its handoff run starts, the system shall set the handoff card state to `failed`.
- When a `report` run finishes with a reply, the system shall post the reply as a new message of the conversation, not a thread reply, and broadcast a `bot.report` event naming the bot, the conversation, the item and the text.

### Unwanted-behavior (must-not)

- The system shall not start a bot-triggered run beyond the depth limit; it shall post a `handoff.depth_exceeded` event instead.
- The system shall not accept a handoff whose receiver is the sending bot.
- The system shall not give the receiver of a handoff the history of the conversation the handoff was made in; its input is the sender, the task and the context the sender wrote.
- The system shall not start runs for the bots that a `report` run's reply mentions, for the bots the replying run handed work to, or for the bot that handed the replying run its task.
- The system shall not accept a handoff to a role that two or more bots hold; it shall answer with their handles.

## Acceptance criteria

1. [verified] `team.handoff` returns an acknowledgment before the receiver runs, the receiver's run starts afterwards, a handoff card appears in the conversation, and the receiver's reply lands as a thread reply to the card — verified by `packages/hub/test/handoff.test.ts`.
2. [verified] With `returnResult` true, the sender runs again with the receiver's reply as input — verified by `packages/hub/test/handoff.test.ts`.
3. [verified] Two bots that hand off to each other stop at depth 4 and a `handoff.depth_exceeded` event is posted — verified by `packages/hub/test/handoff.test.ts`.
4. [verified] A handoff to the sending bot itself returns an error result — verified by `packages/hub/test/handoff.test.ts`.
5. [verified] A run that hands off to two bots wakes its bot once, as a `report` run, after both ended, with the answer of one and the failure of the other; the report is a new message, a `bot.report` event names it, and the report's mentions start no one — verified by `packages/hub/test/team.test.ts`.
6. [verified] A handoff to a role reaches the one bot holding it, and a role two bots hold is refused naming both — verified by `packages/hub/test/team.test.ts`.

## Maturity

**MVP (committed):**

- Handoff tool, handoff cards, threaded replies, return results, lead bot, depth limit.

**Future (aspirational, not committed):**

- An optional task board fed by handoffs.
- Group summaries posted by the lead bot on a schedule.

## Out of scope for this spec

- Group message routing (see `specs/conversations`).
