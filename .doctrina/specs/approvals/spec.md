# Spec — approvals

**Capability:** approvals
**Status:** active
**Implementation:** verified
**Realizes:** SC5
**Depends on:** tool-gateway, conversations
**Last updated:** 2026-09-27
**Version:** 0.3.0

## Purpose

Bots must not send, spend or publish without the user's yes. This capability
decides, for every tool call, whether it runs, waits for the user or is
refused, and it turns every outbound message into a draft that leaves only
when the user presses Send. Deterministic rules decide; a remembered grant or
a model can never override a locked rule.

## Requirements (EARS)

### Ubiquitous

- The system shall evaluate each tool call against the calling bot's policy in this fixed order and stop at the first match: locked `deny` rules, locked `ask` rules, remembered "allow always" grants, the bot's other `deny`, `ask` and `allow` rules in that order, then the tool's default decision.
- The system shall match a policy rule to a tool name with `*` as a wildcard (for example `computer.*`).
- The system shall give `computer.shell` and `routine.create` the default decision `ask`, and every other registered tool the default decision `allow`.
- The system shall show every pending approval as an approval card in the run's conversation, carrying the bot, the tool, the input with secret values masked, and the brain's stated reason.
- The system shall represent every outbound message a bot prepares (email, chat message, social post, webhook call) as a draft card with editable recipient, subject and body, and the actions Send and Discard.
- The system shall deliver a draft whose channel is `webhook` as an HTTP POST of its fields to its URL, and append every other draft to the `outbox.jsonl` file of the data directory.

### Event-driven

- When the policy decision for a tool call is `ask`, the system shall pause the run, set the bot state to `waiting`, create an approval card and broadcast an `approval.requested` event.
- When the user answers "allow once", the system shall execute the pending call and resume the run.
- When the user answers "allow always", the system shall store a grant for that bot and tool name, execute the pending call and resume the run.
- When the user answers "deny", the system shall return a denial result carrying the user's optional note to the brain, execute nothing and resume the run.
- When the user presses Send on a draft card, the system shall deliver the draft as edited through its delivery channel, mark the card `sent` and record the delivery result on the card.
- When the user presses Discard on a draft card, the system shall mark the card `discarded`.
- When Claude Code asks permission for one of its built-in tools, the system shall decide it as the Orbis tool with the same effect — Bash as `computer.shell`; Write, Edit, MultiEdit and NotebookEdit as `computer.write_file`; Read, Glob, Grep and LS as `computer.read_file`; WebFetch and WebSearch as `http.fetch` — and allow every other built-in tool.
- When a run ends while one of its approvals is pending, the system shall mark the approval `expired` and its card `expired`.

### State-driven

- While an approval is pending, the system shall keep the run paused, bounded only by the run's own timeout, and list the approval in every client's approvals inbox.
- While a run has more than one request to the user open, the system shall keep it `waiting` until the last one is answered.

### Unwanted-behavior (must-not)

- The system shall not let a remembered grant, a bot's description or any brain output override a locked rule.
- The system shall not deliver a draft before the user presses Send.
- The system shall not execute a call the user denied.

### Optional

- Where a run belongs to a routine in `draft_only` mode, the system may force every tool of risk class `external` to produce a draft instead of acting.

## Acceptance criteria

1. [verified] A table of policies and calls yields the documented decision for every precedence level, including a locked `ask` that beats an "allow always" grant — verified by `packages/hub/test/approvals/policy.test.ts`.
2. [verified] An `ask` decision pauses the run, sets the bot to `waiting`, posts an approval card and broadcasts `approval.requested`; "allow once" resumes the run and executes the call; "deny" returns a denial and executes nothing — verified by `packages/hub/test/approvals/approvals.test.ts`.
3. [verified] "Allow always" stores a grant so that the next identical call runs without a card — verified by `packages/hub/test/approvals/approvals.test.ts`.
4. [verified] A draft is delivered only after Send, with the user's edits, and a discarded draft is never delivered — verified by `packages/hub/test/approvals/drafts.test.ts`.
5. [verified] In a draft-only routine run (every routine test run), an `external` tool call becomes a draft card and does not run, and the bot is told so — verified by `packages/hub/test/routines.test.ts`.
6. [verified] A run with two open approvals stays waiting after the first answer and runs again after the second — verified by `packages/hub/test/chat-audit.test.ts`.

## Maturity

**MVP (committed):**

- Deterministic policy with locked rules, grants, approval cards, drafts with Send and Discard, a webhook delivery channel and an outbox channel.

**Future (aspirational, not committed):**

- Auto review: a cheap or local model that judges risky calls, always subordinate to the deterministic rules.
- Team-wide rules set by an administrator.
- SMTP and Slack delivery channels.

## Out of scope for this spec

- Which tools exist (see `specs/tool-gateway`).
