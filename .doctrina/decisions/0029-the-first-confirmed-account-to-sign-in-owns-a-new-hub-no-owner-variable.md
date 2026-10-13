# ADR 0029 — The first confirmed account to sign in owns a new hub; no owner variable

- **Status:** accepted
- **Date:** 2026-10-13
- **Deciders:** the project owner
- **Supersedes:** 0028
- **Superseded by:** —
- **Evidence:** `packages/hub/src/auth/account.ts`, `packages/hub/test/auth.test.ts`
- **Landed:** 2026-10-13 — `packages/hub/src/auth/account.ts`, `packages/hub/test/auth.test.ts`

<!--
Evidence anchors the decision to reality. Once accepted, cite the file(s)
that prove this decision is actually implemented, in backticks, e.g.
"- **Evidence:** `proto/order.proto`, `services/gateway/grpc.ts`".
`doctrina validate` warns when cited evidence is missing on disk (the
decision drifted from the code) or when an accepted ADR cites none. For a
process decision with no code artifact, write "n/a — <why>".

Landed is the non-mutating "this decision is now implemented and verified
here" stamp. Many ADRs are accepted at design time with "Evidence: n/a — no
implementation yet"; once the capability ships, run
"doctrina decision land NNNN `path/to/proof.ts` ..." to record the date and
proof without editing the immutable body. A filled Landed satisfies the
accepted-ADR evidence check.
-->

## Context

ADR 0028 named a hub's owner with `ORBIS_OWNER_EMAIL`. The owner refused the extra step: the accounts already
live in Supabase, so they asked for no variable and no token ("não quero intermediários"). A hub belongs to one
person: their bots, terminal and keys (ADR 0027). Letting every account into every hub would mix people.

## Decision

A hub with accounts on always shows the account's sign-in. While no account is linked, the first session of a
project account whose email is confirmed (`user_metadata.email_verified`) links the hub and opens it. From then
on only that account id opens the hub, as in ADR 0021. The token stays the recovery key, and it can still link a
chosen account. `ORBIS_OWNER_EMAIL` is removed.

## Alternatives considered

1. Every account opens every hub: one person would see and drive another's bots, terminal and keys.
2. Keep `ORBIS_OWNER_EMAIL`: safe, but the owner refused a step that repeats what Supabase already knows.

## Consequences

**Positive**

- A new hub opens with email and password, with no console step and no variable.

**Negative**

- Until its first sign-in, any confirmed account that reaches a new hub can take it. On a home server only
  tailnet devices reach it. On the internet, the hub should be opened right after it starts, or new sign-ups
  closed in Supabase.

**Neutral**

- Unlinking a hub (Settings → Account) makes it new again.

<!--
Once this ADR is accepted, do not edit it. To change the decision,
create a new ADR that supersedes this one and update the "Superseded by"
header above to point at the new ADR. Status transitions:
proposed -> accepted | rejected
accepted -> deprecated | superseded by NNNN
-->
