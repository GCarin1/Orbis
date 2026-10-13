# Change 0074-owner-sign-in — a new hub opens with its owner's sign-in

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

The user asked: "Não quero precisar ter que pegar o token… quero que substitua para uma tela de login". A new hub
opened with its token only. Getting it meant a Portainer console and `cat /data/token`, although every person
already has an Orbis account in Supabase.

## What

- `ORBIS_OWNER_EMAIL` (`packages/hub/src/config.ts`) names the hub's owner.
- Before any account is linked, `GET /api/v1/auth/config` reports `linked: true`, so the web shows the
  account's sign-in.
- The first session of the account with that email and a confirmed address (the `user_metadata.email_verified`
  claim) links the hub and opens it (`packages/hub/src/auth/account.ts`).
- Once linked, only that account id counts, as before.
- The token stays the recovery key.
- `deploy/umbrel/docker-compose.yml`, `deploy/docker-compose.yml`, `.env.example`, `docs/umbrel.md`, the
  `hub-surface` contract and the CHANGELOG are updated with the new variable.

## Scope boundaries

Without `ORBIS_OWNER_EMAIL` nothing changes: the token links an account as before. An open "first account claims the hub" was rejected, because anyone with a sign-up on the project could take a new hub.

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
