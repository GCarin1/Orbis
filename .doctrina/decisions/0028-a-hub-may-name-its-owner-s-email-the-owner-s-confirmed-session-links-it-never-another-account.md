# ADR 0028 — A hub may name its owner's email; the owner's confirmed session links it, never another account

- **Status:** accepted
- **Date:** 2026-10-13
- **Deciders:** the project owner
- **Supersedes:** —
- **Superseded by:** —
- **Evidence:** `packages/hub/src/auth/account.ts`, `packages/hub/src/config.ts`, `packages/hub/test/auth.test.ts`
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

A new hub opened with its token only (ADR 0021, change 0064): only a token holder could link an account.
On a home server (ADR 0027) getting the token meant a Portainer console and `cat /data/token`. Every person of
the house already has an Orbis account in Supabase. The owner asked for an account sign-in from the first visit.

## Decision

A hub may name its owner with `ORBIS_OWNER_EMAIL`. Until an account is linked, such a hub reports that an
account opens it. The first session of the account with that email, its email confirmed
(`user_metadata.email_verified`), links the hub to that account id and opens it. Once linked, nothing changes
from ADR 0021: only that account id opens the hub, and the token stays the recovery key. Without the variable a
hub still links only through its token.

## Alternatives considered

1. The first account to sign in claims the hub: anyone with a sign-up on the project, inside the tailnet,
   could take a new hub before its owner.
2. Name the owner by account id: safe, but the owner has to look the id up in Supabase, which is no better
   than copying the token.
3. Remove the token: it is the recovery key when the authenticator is lost.

## Consequences

**Positive**

- A new hub opens with the email and password, with no console step.
- Who owns the hub is written in its own stack, next to its address.

**Negative**

- Until the first sign-in, the hub trusts Supabase's email confirmation. Supabase must keep confirming emails
  before a session is given.

**Neutral**

- Hubs without `ORBIS_OWNER_EMAIL` behave exactly as before.

<!--
Once this ADR is accepted, do not edit it. To change the decision,
create a new ADR that supersedes this one and update the "Superseded by"
header above to point at the new ADR. Status transitions:
proposed -> accepted | rejected
accepted -> deprecated | superseded by NNNN
-->
