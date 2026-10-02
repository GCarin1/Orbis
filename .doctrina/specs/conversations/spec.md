# Spec — conversations

**Capability:** conversations
**Status:** active
**Implementation:** verified
**Realizes:** SC1, SC4
**Depends on:** bots
**Last updated:** 2026-09-27
**Version:** 0.7.1

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
- The system shall give every run a chain id: a user message starts one chain that every bot it runs shares, and the handoffs, reports back and mentions that follow from them carry it on.
- The system shall tell each run where it takes place: the bot's own conversation, a colleague's conversation it was brought into, or a group with its title, its other members and whether the bot leads it.
- The system shall write a run's steps to the database at most every 250 ms while it runs and once when it ends, and index the lookups every run makes (items, approvals and routine records by run; runs by conversation and by status).

### Event-driven

- When the user posts a message in a direct conversation, the system shall start a run for that conversation's bot with the message as input, also when the message mentions other bots, whom that bot brings in.
- When the user posts a message in a group that mentions bots of the team by `@handle` or by role (`@qa` names every bot whose role is QA), the system shall start one run for each mentioned bot, member of the group or not.
- When the user posts a message in a group that contains `@everyone`, the system shall start one run for every member bot.
- When the user posts a message in a group with no mention, the system shall start a run for the group's lead bot only.
- When a bot's reply in a direct or group conversation mentions one or two other bots of the team by `@handle` or by role, the system shall start one run, triggered as `mention`, for each of them in that conversation, in the chain of the run that replied, subject to the chain limits and the exceptions of `specs/handoff`.
- When a client asks for the direct conversation of a bot that has none, the system shall create it, so that each bot has at most one direct conversation.
- When a client adds or removes a reaction on a timeline item, the system shall update the item's reactions and broadcast the change.
- When the user asks to try a failed or cancelled run again, the system shall start a new run of the same bot in the same conversation with the same task and skill, recording the run it retries, and point a handoff card at the new run.
- When the user tries a run again, the system shall keep the new run in the old run's chain.

### State-driven

- While a bot has a run in progress in a conversation, the system shall queue further inputs for that bot in that conversation and start them in arrival order after the current run ends.

### Unwanted-behavior (must-not)

- The system shall not add a bot to a group that already holds ORBIS_MAX_GROUP_SIZE members.
- The system shall not treat `@everyone` in a group as a mention of bots outside the group.
- The system shall not accept a message with empty text and no attachment.
- The system shall not wake any bot for a reply that names more than two bots of the team, which reads as a list of the team; it shall post a `mention.list` event instead.
- The system shall not start a run for a bot that a `mention` run's reply names, nor wake by mention a bot that already ran in the same chain.
- The system shall not try again a run that is queued, running, waiting or done; it shall answer 409.
- The system shall not try again a routine's or a webhook's run outside its routine, which keeps the routine's rules (a test run is draft-only); it shall answer 409 `routine_run`.

## Acceptance criteria

1. [verified] A message in a direct conversation starts exactly one run of that conversation's bot, and the bot's reply is appended to the same timeline — verified by `packages/hub/test/conversations.test.ts`.
2. [verified] In a group, a message mentioning one member runs only that member, `@everyone` runs every member, and a message with no mention runs only the lead — verified by `packages/hub/test/conversations.test.ts`.
3. [verified] Adding a seventh member to a group with the default limit answers 409 — verified by `packages/hub/test/conversations.test.ts`.
4. [verified] A thread reply stores its parent id, and a reaction change is broadcast as a `timeline.item` event — verified by `packages/hub/test/conversations.test.ts`.
5. [verified] Two messages sent while a run is in progress start two further runs in arrival order — verified by `packages/hub/test/runs.test.ts`.
6. [verified] A bot's reply in a direct conversation that mentions a colleague by role starts that colleague's run in the same conversation, and a user message in a group that mentions a role runs the bot holding it even outside the group — verified by `packages/hub/test/team.test.ts`.
7. [verified] A lead's reply listing three colleagues wakes none and posts `mention.list`; a reply calling one colleague wakes it once as `mention`, and its answer naming the lead back wakes no one; `@everyone` runs each member once — verified by `packages/hub/test/bot-behaviour.test.ts`.
8. [verified] Two bots one user message mentions, whose replies mention each other, run once each, in one chain — verified by `packages/hub/test/handoff.test.ts`.
9. [verified] A group run is told the group's title, the other members and that the bot leads it, and a direct run that it is the bot's own conversation; a run that failed for a missing key is tried again after the brain is fixed and replies, and trying a done run again answers 409 — verified by `packages/hub/test/chat-audit.test.ts`.
10. [verified] A run of 40 tool calls stores all its steps with fewer writes than a quarter of them; the database holds the run, conversation and status indexes; a retried run keeps its chain and its reply does not wake again a bot that already answered — verified by `packages/hub/test/audit-cycle5.test.ts`.
11. [verified] Trying again a failed routine test run answers 409 `routine_run` — verified by `packages/hub/test/review.test.ts`.

## Maturity

**MVP (committed):**

- Direct and group conversations, routing by mention, threads, reactions, one timeline, live stream.

**Future (aspirational, not committed):**

- Voice memos, dictation and live voice chat.
- Full-text search across all timelines.
- Image understanding for attachments on brains that support it.

## Out of scope for this spec

- The content of cards (see `specs/approvals`, `specs/handoff`, `specs/secrets`, `specs/routines`).
