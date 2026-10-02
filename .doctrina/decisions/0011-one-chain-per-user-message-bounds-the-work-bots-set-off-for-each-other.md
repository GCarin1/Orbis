# ADR 0011 — One chain per user message bounds the work bots set off for each other

- **Status:** accepted
- **Scope:** conversations, handoff
- **Date:** 2026-10-02
- **Deciders:** project owner (reported the loop and asked for a full audit of bot behaviour), Claude Code
- **Supersedes:** —
- **Superseded by:** —
- **Evidence:** `packages/hub/src/collab/handoff.ts`, `packages/hub/src/runs/engine.ts`, `packages/hub/test/bot-behaviour.test.ts`, `packages/hub/test/handoff.test.ts`
- **Landed:** 2026-10-02 — `packages/hub/src/collab/handoff.ts`, `packages/hub/test/bot-behaviour.test.ts`

## Context

Bots wake each other three ways: a handoff, the report back to the bot that
delegated, and an `@mention` in a reply. Only a depth limit (6) bounded them.
In the owner's test a group of four bots answered "who is available?" with a
list of the team — every name an `@mention` — so each reply woke the three
others, whose replies listed the team again: about 3⁶ runs, each a paid or
quota-spending request, from one simple question. Depth does not bound
breadth, and a model's habit of writing `@name` cannot be trusted to change.

## Decision

Every run carries a **chain id**: the user message that started the work, or
the run itself when no message did (an API call, a routine). Handoffs,
reports back and mentions pass it on. The hub enforces, per chain:

1. A reply that names more than two bots is a list: it wakes no one and posts
   a `mention.list` event.
2. A bot woken by a mention answers but its reply wakes no one; a report's
   reply wakes no one (as before).
3. A mention does not wake a bot that already ran in the chain, nor the bots
   the replying run handed work to, nor the bot that handed it its task.
4. The chain holds at most `ORBIS_MAX_CHAIN_RUNS` runs (default 12); a handoff
   or mention beyond it is refused with a `chain.limit` event. A report back is
   never refused, so a delegating bot always learns the outcome.

The depth limit stays as a second bound.

## Alternatives considered

1. Lower the depth limit — rejected: a fan-out of three is still 27 runs at
   depth 3, and real delegation needs depth.
2. Never wake bots on mentions in bot replies — rejected: it removes the way
   a bot asks one colleague for help in front of the user.
3. Tell the models not to mention — kept as guidance in the bot's context,
   rejected as the only safeguard.

## Consequences

**Positive**

- One message costs at most a known number of runs, whatever the models do.
- The run list can group a request's whole tree of work by chain id.

**Negative**

- A bot that needs three colleagues at once must hand off to them; the event
  posted says why no one was woken.

**Neutral**

- Runs gain a `chainId` field and the database a `chain_id` column
  (migration 6); older runs read their own id as their chain.
