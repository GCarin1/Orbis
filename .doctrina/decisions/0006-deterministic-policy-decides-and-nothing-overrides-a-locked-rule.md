# ADR 0006 — Deterministic policy decides and nothing overrides a locked rule

- **Status:** accepted
- **Scope:** approvals, tool-gateway, routines
- **Date:** 2026-09-27
- **Deciders:** project owner (research: "regras determinísticas vencem o revisor"), Claude Code
- **Supersedes:** —
- **Superseded by:** —
- **Evidence:** n/a — no implementation yet; land with the tools-and-approvals change
- **Landed:** 2026-09-27 — `packages/hub/src/approvals/policy.ts`, `packages/hub/src/approvals/service.ts`, `packages/hub/test/approvals/policy.test.ts`

## Context

Almost every bot template in the reference marketplace repeats one rule: do
not send, spend or publish without the user's yes. A model-based reviewer can
be wrong or be prompt-injected by the very content it reviews. Users also
want to stop being asked about the same safe action.

## Decision

A tool call is decided by a pure function of (bot policy, grants, tool,
default) with a fixed precedence: locked deny, locked ask, remembered
"allow always" grants, the bot's deny/ask/allow rules, the tool default.
Outbound messages are drafts by construction: the tool that prepares them
cannot deliver, only the user's Send can. A future model reviewer may only
turn an `allow` into an `ask`, never an `ask` or `deny` into an `allow`.

## Alternatives considered

1. A model reviewer as the primary gate — rejected: non-deterministic and
   injectable.
2. Asking for every call — rejected: users would click "allow" without
   reading.

## Consequences

**Positive**

- Decisions are reproducible and testable as a table.
- Prompt injection cannot unlock a locked rule.

**Negative**

- Users must write rules for fine-grained cases (for example
  `computer.shell` with a command prefix is future work).

**Neutral**

- "Allow always" is stored per bot and tool name and can be revoked from
  the bot settings.
