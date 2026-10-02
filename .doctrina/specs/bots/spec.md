# Spec — bots

**Capability:** bots
**Status:** active
**Implementation:** verified
**Realizes:** SC1
**Last updated:** 2026-09-27
**Version:** 0.6.0

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

### Event-driven

- When a user duplicates a bot, the system shall create a new bot with the same name suffixed " (copy)", role, description, avatar color and shape, brain, manager, policy, computer configuration and skill allowlist, a new handle, and no memory, conversations, computer state or secrets.
- When a user deletes a bot, the system shall delete its memory entries, routines, secrets, runs and direct conversation, remove it from every group, and ask the computer provider to destroy its computer.
- When a user pins or hides a bot, the system shall store the flag, and the roster listing shall return pinned bots first and leave hidden bots out unless the request asks for hidden bots.
- When a run of a bot starts, calls a brain, executes a tool, waits for the user, fails or finishes, the system shall set the bot state to `thinking`, `thinking`, `working`, `waiting`, `blocked` or `done` respectively and broadcast a `bot.state` event.
- When the user marks the bot's direct conversation as read while the bot is `done`, the system shall set the bot state to `idle`.
- When a user deletes a bot that other bots report to, the system shall make them report to the deleted bot's own manager, or to no one.
- When the hub starts, the system shall mark the runs a previous process left running or waiting as failed and those left queued as cancelled.

### State-driven

- While a bot still has a run running or waiting in another conversation, the system shall keep it `working` or `waiting` when one of its runs ends.

### Unwanted-behavior (must-not)

- The system shall not create a bot when the installation already holds the maximum number of bots (ORBIS_MAX_BOTS, default 50).
- The system shall not accept a handle that another bot already uses, that equals `everyone`, or that falls outside `[a-z0-9-]{2,32}`.
- The system shall not let a bot report to itself, to a bot that does not exist, or to a bot that already reports to it directly or through others.

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
