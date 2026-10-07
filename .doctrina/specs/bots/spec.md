# Spec — bots

**Capability:** bots
**Status:** active
**Implementation:** verified
**Realizes:** SC1
**Last updated:** 2026-09-27
**Version:** 0.8.0

## Purpose

A bot is a durable AI colleague: a named identity with a role, durable rules,
an avatar, a brain configuration, a tool policy, a computer configuration, a
skill allowlist and a spend cap. This capability owns the bot record, its
lifecycle (create, edit, duplicate, pin, hide, delete) and its visible state.
Everything else in Orbis hangs off a bot.

## Requirements (EARS)

### Ubiquitous

- The system shall store each bot with an id, a unique handle, a name, a role label, a description that holds its durable rules, an avatar made of a color and a shape (one of `orb`, `blob`, `square`, `pill`, `triangle`, `hexagon`, `cloud`, `drop`) with initials derived from the name, a brain configuration, the bot it reports to (its manager, or none), a tool policy, a tool allowlist, a computer configuration, a skill allowlist and a monthly spend cap in USD.
- The system shall derive a new bot's handle from its name as a lowercase slug of 2 to 32 characters from `[a-z0-9-]`, appending `-2`, `-3` and so on when the handle is taken.
- The system shall place the bot's name, role and description in every prompt sent to its brain, ahead of the task of the moment.
- The system shall expose each bot's state as exactly one of `idle`, `thinking`, `working`, `waiting`, `blocked` or `done`.
- The system shall persist bots in the hub database so that a bot and its settings survive a hub restart.
- The system shall place in every prompt of a bot its team: the bot it reports to, the bots that report to it and its other colleagues with their roles, and how to delegate to them and bring them into a conversation.
- The system shall keep for each bot its initiative — whether it may write to the user on its own (off until the user turns it on), how often (rarely: at most once a day after 12 hours of quiet; sometimes: twice a day after 4 hours; often: four times a day after 2 hours) and whether it answers its MCP servers' updates — and for every bot a switch and quiet hours in the user's timezone (22:00 to 08:00 until changed).

### Event-driven

- When a user duplicates a bot, the system shall create a new bot with the same name suffixed " (copy)", role, description, avatar color and shape, brain, manager, policy, computer configuration and skill allowlist, a new handle, and no memory, conversations, computer state or secrets.
- When a user deletes a bot, the system shall delete its memory entries, routines, secrets, runs and direct conversation, remove it from every group, and ask the computer provider to destroy its computer.
- When a user pins or hides a bot, the system shall store the flag, and the roster listing shall return pinned bots first and leave hidden bots out unless the request asks for hidden bots.
- When a run of a bot starts, calls a brain, executes a tool, waits for the user, fails or finishes, the system shall set the bot state to `thinking`, `thinking`, `working`, `waiting`, `blocked` or `done` respectively and broadcast a `bot.state` event.
- When the user marks the bot's direct conversation as read while the bot is `done`, the system shall set the bot state to `idle`.
- When a user deletes a bot that other bots report to, the system shall make them report to the deleted bot's own manager, or to no one.
- When the hub starts, the system shall mark the runs a previous process left running or waiting as failed and those left queued as cancelled.
- When a bot with initiative has been quiet for its rhythm's time, every bot's initiative is on, it is not in the quiet hours, the bot is not working, and its last message on its own was answered by the user, the system shall now and then start a run in the bot's conversation with the user that asks it to write on its own (a task to ask for, an insight, a reminder or an alert, in one to three sentences) or to answer `[silent]`.
- When the user presses "Try it now" for a bot that is not working, the system shall start such a run at once.
- When the updates of an MCP server a bot watches reach it, the system shall start a run of the bot's initiative (`mcp`) that hands them as untrusted data and asks the bot to tell the user what matters in one to three sentences or to answer `[silent]`, holding them through the quiet hours and while the bot works, and at most 12 times a day per bot.

### State-driven

- While a bot still has a run running or waiting in another conversation, the system shall keep it `working` or `waiting` when one of its runs ends.

### Unwanted-behavior (must-not)

- The system shall not create a bot when the installation already holds the maximum number of bots (ORBIS_MAX_BOTS, default 50).
- The system shall not accept a handle that another bot already uses, that equals `everyone`, or that falls outside `[a-z0-9-]{2,32}`.
- The system shall not let a bot report to itself, to a bot that does not exist, or to a bot that already reports to it directly or through others.
- The system shall not post a `[silent]` answer of a run of initiative, nor say its failure in the conversation, nor count either toward the bot's day.
- The system shall not write on a bot's initiative more often than its rhythm allows in 24 hours, nor in the quiet hours, nor while every bot's initiative is off.
- The system shall not wake a bot with MCP updates while every bot's initiative is off.

### Optional

- Where a new bot has no avatar color or shape, the system may derive the color from a hash of its role label and the shape from a hash of its name.

## Acceptance criteria

1. [verified] Creating a bot through `POST /api/v1/bots` answers 201 with id, handle, initials and color, and a new hub instance opened on the same data directory lists the same bot with the same settings — verified by `packages/hub/test/bots.test.ts`.
2. [verified] Duplicating a bot copies identity, description, brain, policy, computer configuration and skill allowlist, and the copy has a new handle and no memory entries or secrets — verified by `packages/hub/test/bots.test.ts`.
3. [verified] Deleting a bot removes its memory entries, routines, secrets and direct conversation and calls the computer provider's destroy for that bot — verified by `packages/hub/test/bots.test.ts`.
4. [verified] Creating a bot beyond ORBIS_MAX_BOTS answers 409, and the handles `everyone`, `A` and a duplicate handle answer 400 or 409 — verified by `packages/hub/test/bots.test.ts`.
5. [verified] The roster lists pinned bots first and leaves hidden bots out unless `includeHidden=true` — verified by `packages/hub/test/bots.test.ts`.
6. [verified] A run moves the bot through `thinking`, `working`, `done` and broadcasts one `bot.state` event per transition — verified by `packages/hub/test/runs.test.ts`.
7. [verified] A bot records the manager it reports to; reporting to itself, to a bot that reports to it or to an unknown bot answers 400; a duplicate keeps the manager; deleting a manager moves its reports to its own manager; each bot's prompt names its manager, its reports and its colleagues — verified by `packages/hub/test/team.test.ts`.
8. [verified] A bot keeps the avatar shape and color it is given, gets both derived when none is given, refuses an unknown shape with 400, and a duplicate keeps them — verified by `packages/hub/test/bots.test.ts`.
9. [verified] A bot whose short run ends while its long run goes on stays `working`, then becomes `done`; runs left waiting and their handoff cards are failed after a restart — verified by `packages/hub/test/chat-audit.test.ts`.
10. [verified] A new bot's initiative is off and it never writes on its own; turned on, it writes after its rhythm's quiet and not before, the run says how long it was quiet and offers [silent], the message is posted in its conversation, no other one comes before the user answers and one comes after; a rare bot writes once a day at most and an unlucky roll waits; quiet hours in the user's timezone and every bot's switch hold it back, times and timezones are checked; [silent] posts nothing, a failure says nothing and neither counts; Try it now starts a run at once and is refused while the bot works — verified by `packages/hub/test/initiative.test.ts`
11. [verified] Updates sent in the quiet hours wait and reach the bot when they end; with every bot's initiative off they reach nobody, then or later — verified by `packages/hub/test/mcp-updates.test.ts`

## Maturity

**MVP (committed):**

- Bot record, handle rules, CRUD, duplicate, pin, hide, delete with cascade.
- State machine and `bot.state` events.

**Future (aspirational, not committed):**

- Teams and departments above roles, with per-team defaults.
- Avatar image upload.
- An audit bot that reports duplicated roles and bots with no owner.

## Out of scope for this spec

- What a brain does with the prompt (see `specs/agent-runtimes`).
- The computer's own lifecycle beyond the destroy call (see `specs/computer`).
