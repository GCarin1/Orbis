# Spec — handoff

**Capability:** handoff
**Status:** active
**Implementation:** planned — built by the collaboration change (product.md delivery order 4)
**Realizes:** SC4
**Depends on:** conversations, agent-runtimes, tool-gateway
**Last updated:** 2026-09-27
**Version:** 0.1.0

## Purpose

Bots cooperate by passing work to each other asynchronously. A handoff wakes
the receiving bot with a task; the receiver works and answers later; the
passage stays visible in the conversation. A group's lead bot plays the
coordinator role (chief of staff) with no extra dashboard. A depth limit stops
bots from bouncing work between themselves forever.

## Requirements (EARS)

### Ubiquitous

- The system shall provide the `team.handoff` tool with the inputs `to` (a bot handle), `task` (text), and the optional `context` (text) and `returnResult` (boolean).
- The system shall show every handoff in the conversation where it was made as a handoff card naming the sender, the receiver, the task and the handoff state (`queued`, `running`, `done` or `failed`).
- The system shall let a group name one lead bot, and treat the group's first member as lead when none is named.
- The system shall limit each chain of bot-triggered runs (handoffs and bot-to-bot mentions) to a depth of 4, set by ORBIS_MAX_HANDOFF_DEPTH.

### Event-driven

- When a bot calls `team.handoff`, the system shall queue a run for the receiving bot carrying the task and context, and return to the caller at once an acknowledgment with the handoff id, without waiting for the receiver.
- When the receiving bot's handoff run finishes, the system shall post its reply as a thread reply to the handoff card and set the card state to `done`.
- When a handoff has `returnResult` set to true and the receiver finishes, the system shall start a run for the sending bot with the receiver's reply as its input.
- When the receiving bot is deleted before its handoff run starts, the system shall set the handoff card state to `failed`.

### Unwanted-behavior (must-not)

- The system shall not start a bot-triggered run beyond the depth limit; it shall post a `handoff.depth_exceeded` event instead.
- The system shall not accept a handoff whose receiver is the sending bot.

## Acceptance criteria

1. [unverified] `team.handoff` returns an acknowledgment before the receiver runs, the receiver's run starts afterwards, a handoff card appears in the conversation, and the receiver's reply lands as a thread reply to the card — verified by `packages/hub/test/handoff.test.ts`.
2. [unverified] With `returnResult` true, the sender runs again with the receiver's reply as input — verified by `packages/hub/test/handoff.test.ts`.
3. [unverified] Two bots that hand off to each other stop at depth 4 and a `handoff.depth_exceeded` event is posted — verified by `packages/hub/test/handoff.test.ts`.
4. [unverified] A handoff to the sending bot itself returns an error result — verified by `packages/hub/test/handoff.test.ts`.

## Maturity

**MVP (committed):**

- Handoff tool, handoff cards, threaded replies, return results, lead bot, depth limit.

**Future (aspirational, not committed):**

- An optional task board fed by handoffs.
- Group summaries posted by the lead bot on a schedule.

## Out of scope for this spec

- Group message routing (see `specs/conversations`).
