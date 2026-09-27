# Spec — conversations

**Capability:** conversations
**Status:** active
**Implementation:** verified
**Realizes:** SC1, SC4
**Depends on:** bots
**Last updated:** 2026-09-27
**Version:** 0.3.0

## Purpose

Conversations are where people and bots meet: a direct conversation with one
bot, or a group of bots. Each conversation has ONE timeline that mixes
messages, events (routine created, settings changed, bot-to-bot messages) and
cards (approval, draft, handoff, secret request). This capability owns the
timeline, message routing to bots, threads, reactions and the live stream of
timeline changes.

## Requirements (EARS)

### Ubiquitous

- The system shall keep one timeline per conversation holding messages, events and cards in creation order.
- The system shall support direct conversations with exactly one bot and group conversations with 2 to 6 bots, the upper bound set by ORBIS_MAX_GROUP_SIZE.
- The system shall record for each message its author (user, bot or system), text, attachment references, mentioned handles, optional parent message id for a thread reply, reactions and the run that produced it.
- The system shall broadcast every created or changed timeline item over the WebSocket stream as a `timeline.item` event.
- The system shall persist conversations and timelines in the hub database.

### Event-driven

- When the user posts a message in a direct conversation, the system shall start a run for that conversation's bot with the message as input.
- When the user posts a message in a group that mentions one or more member bots by `@handle`, the system shall start one run for each mentioned member.
- When the user posts a message in a group that contains `@everyone`, the system shall start one run for every member bot.
- When the user posts a message in a group with no mention, the system shall start a run for the group's lead bot only.
- When a bot's reply in a group mentions another member bot by `@handle`, the system shall start a run for the mentioned bot, subject to the chain depth limit of `specs/handoff`.
- When a client asks for the direct conversation of a bot that has none, the system shall create it, so that each bot has at most one direct conversation.
- When a client adds or removes a reaction on a timeline item, the system shall update the item's reactions and broadcast the change.

### State-driven

- While a bot has a run in progress in a conversation, the system shall queue further inputs for that bot in that conversation and start them in arrival order after the current run ends.

### Unwanted-behavior (must-not)

- The system shall not add a bot to a group that already holds ORBIS_MAX_GROUP_SIZE members.
- The system shall not start a run for a mentioned handle that is not a member of the group.
- The system shall not accept a message with empty text and no attachment.

## Acceptance criteria

1. [verified] A message in a direct conversation starts exactly one run of that conversation's bot, and the bot's reply is appended to the same timeline — verified by `packages/hub/test/conversations.test.ts`.
2. [verified] In a group, a message mentioning one member runs only that member, `@everyone` runs every member, and a message with no mention runs only the lead — verified by `packages/hub/test/conversations.test.ts`.
3. [verified] Adding a seventh member to a group with the default limit answers 409 — verified by `packages/hub/test/conversations.test.ts`.
4. [verified] A thread reply stores its parent id, and a reaction change is broadcast as a `timeline.item` event — verified by `packages/hub/test/conversations.test.ts`.
5. [verified] Two messages sent while a run is in progress start two further runs in arrival order — verified by `packages/hub/test/runs.test.ts`.

## Maturity

**MVP (committed):**

- Direct and group conversations, routing by mention, threads, reactions, one timeline, live stream.

**Future (aspirational, not committed):**

- Voice memos, dictation and live voice chat.
- Full-text search across all timelines.
- Image understanding for attachments on brains that support it.

## Out of scope for this spec

- The content of cards (see `specs/approvals`, `specs/handoff`, `specs/secrets`, `specs/routines`).
