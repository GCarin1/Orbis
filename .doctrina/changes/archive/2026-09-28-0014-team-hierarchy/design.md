# Design — Change 0014-team-hierarchy

## Approach

A hierarchy is one nullable column: each bot names the bot it reports to.
It shapes behaviour through the prompt, not through hard routing: every bot
learns its manager, its reports and its colleagues, and is told to split work
across its reports with `team.handoff`. The model decides what to delegate.

The report back is structural, so it does not depend on the model: all
handoff cards one run posts form a batch (they share the item's `runId`).
When the last card of a batch turns `done` or `failed`, the sender runs once
more with trigger `report` and every answer, and its reply is a new message
in the conversation plus a `bot.report` event, which the desktop app turns
into a notification. The batch state lives on the cards
(`reportRunId`), so it survives a hub restart and never reports twice.

Mentions become the way bots talk without the user: a reply that names a
colleague (by handle, or by role written like a handle) starts that colleague
in the same conversation. Three exclusions stop double work: the bots the
run just handed work to, the bot that handed this run its task (it gets the
answer in its report), and anything said in a report.

## Alternatives considered

- Start mentioned bots from the user's message in a direct conversation:
  rejected after a test showed "ask @bob to…" in Ana's conversation running
  Bob instead of Ana. The conversation's own bot answers and coordinates.
- One report back per handoff (the old `returnResult` behaviour): rejected,
  a manager with three reports would talk to the user three times.
- A separate delegation tool restricted to reports: rejected, the hierarchy
  guides the model through the prompt, and a manager may still need a
  colleague outside its reports.

## Trade-offs and risks

- A report run spends one more model call per delegating turn.
- Mentions in replies can still chain between two bots that keep naming each
  other; the depth limit (now 6) stops them, as before.
- Group routing changes: a mention of a bot outside the group now runs it.

## Decisions to record as ADRs

- None: this stays within ADR 0003 (runs and events) and ADR 0006 (policy
  still gates every tool a delegated bot uses).
