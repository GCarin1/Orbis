# Design — Change 0021-bot-behaviour-audit

## Approach

Every run carries a chain id: the user message that started the work (or the
run itself when nothing started it). Handoffs, reports back and mentions pass
it on, so the hub can see one request's whole tree of runs. Three rules end
the mention loop where it starts: a reply naming more than two bots is a list
and wakes no one; a bot woken by a mention answers but wakes no one; a bot
that already ran in the chain is not woken again by a mention. The depth
limit stays, and a run budget per chain (`ORBIS_MAX_CHAIN_RUNS`, 12) bounds
everything a single message can cost, handoffs included. Reports back are
never refused, so a delegating bot always hears the outcome.

The other limits work the same way — they bound cost without stopping a bot
that is making progress: the timeout pauses while the run waits for the user,
an API brain's last step must answer, and the gateway refuses only the third
call with exactly the same input.

## Alternatives considered

- **Lower the depth limit.** A tree that fans out three ways is 3⁶ runs at
  depth 6 and still 27 at depth 3; depth does not bound breadth.
- **Never wake bots on mentions in bot replies.** Simple, but it removes the
  way a bot asks one colleague for help in a conversation.
- **Ask the model not to mention.** Kept as guidance in the context, but a
  model's habit is not a guarantee; the hub enforces the rules.

## Trade-offs and risks

- A bot that really needs three colleagues at once must hand off instead of
  mentioning them; the event posted says so.
- Twelve runs per message can stop a large legitimate delegation; the limit is
  a setting.
- The identical-call guard keys on exact input: a model that varies its
  query by one word is not caught, the step limit stops it instead.

## Decisions to record as ADRs

- ADR: one chain per user message bounds bot-to-bot work (chain id, mention
  rules, run budget).
