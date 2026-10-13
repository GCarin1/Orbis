# Change 0075-first-account-owns — first-account-owns

- **Status:** applied
- **Applied:** 2026-10-13
- **Date:** 2026-10-13
- **Owner:**
- **Lane:** product (uncertain)
- **Affects specs:** hub-api

<!--
Optional, and usually absent. The closing docs gate reads COMMAND and FLAG
names out of the prose below and asks for documentation when it finds any.
It cannot tell a change from a mention: explaining an effect, or writing a
Scope boundaries line about what this deliberately does NOT touch, names
things just as loudly as changing them would.

When that happens, say so on the record instead of forcing the close:

- **Documented surface:** n/a — names two commands to explain an effect; alters neither

`none` reads the same as `n/a`, and a BARE one silences nothing — the
reason is the declaration.
-->

## Why

The user asked: "Por que eu precisaria colocar o email na variáveis sendo que ele já está no supabase… não
quero intermediários". Asked who opens a new hub, they chose "the first account is the owner". So the
`ORBIS_OWNER_EMAIL` of change 0074 goes.

## What

- On a new hub (no account linked) with accounts on, `GET /api/v1/auth/config` reports `linked: true`, so the
  web shows email and password.
- The first session of a project account with a confirmed email links the hub and opens it
  (`packages/hub/src/auth/account.ts`). From then on only that account id opens it.
- `ORBIS_OWNER_EMAIL` is removed from the config, the compose files, `.env.example`, `docs/umbrel.md` and the
  contract.
- The sign-in help text no longer says "the account linked to this hub".
- ADR 0029 supersedes ADR 0028.

## Scope boundaries

The token still links a chosen account and stays the recovery key. Two-step verification, tickets and file keys are unchanged.

## Verification

<!--
How you will know the change is correctly applied. Use checkboxes: every
box here is a claim that must be PROVEN before the change is done.
`doctrina change archive` refuses to archive while any box below is
unchecked (pass --force to archive anyway and record the gap). Distinguish
"task marked done" from "verification passed" — link the evidence.
-->

- [x] Automated checks pass (`doctrina verify`).
- [x] The affected spec's acceptance criteria are met and cite their evidence: `packages/hub/test/auth.test.ts`.

## Open questions

<!-- List unresolved decisions. Empty if none. -->
