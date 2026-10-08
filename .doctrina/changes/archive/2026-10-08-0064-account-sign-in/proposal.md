# Change 0064-account-sign-in — account-sign-in

- **Status:** applied
- **Applied:** 2026-10-08
- **Date:** 2026-10-08
- **Owner:** Orbis maintainers
- **Lane:** product
- **Affects specs:**

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

Phase 2 of moving Orbis to the cloud: sign in with an email and a password,
with authentication and security first (ADR 0021). The hub that runs today
(on the phone or a computer) opens for the Orbis account linked to it, and no
credential travels in an address any more.

## What

- Hub: `packages/hub/src/auth/jwt.ts` checks Supabase sessions against the
  project's public keys. `packages/hub/src/auth/account.ts` adds the linked
  account, stream tickets, file keys, the refusal limit and the routes
  `/auth/config`, `/account`, `/account/link`, `/stream/ticket`,
  `/files/key`. `server.ts` uses them in its auth hook, and `?token=` is
  gone. Config gains ORBIS_SUPABASE_URL and ORBIS_SUPABASE_KEY.
- Web: `src/account.ts` is the Supabase Auth REST client with a renewed
  session. The sign-in screen signs in with the account and resets a
  password. Settings → Account adds sign in, create account, link, unlink and
  sign out. `api.ts` uses a credential, file keys and stream tickets.
- CLI: the stream opens with a ticket.
- Specs `hub-api`, `web-app` and `cloud`; contract `hub-surface`; guides
  `docs/api.md` and `docs/cloud-migration.md`.

## Scope boundaries

- No cloud API yet: sessions open the user's own hub. Export and import, the
  runner link and the deploy are later changes.
- The Android app and the desktop app are unchanged: they show the web app.

## Verification

<!--
How you will know the change is correctly applied. Use checkboxes: every
box here is a claim that must be PROVEN before the change is done.
`doctrina change archive` refuses to archive while any box below is
unchecked (pass --force to archive anyway and record the gap). Distinguish
"task marked done" from "verification passed" — link the evidence.
-->

- [x] Automated checks pass (`doctrina verify`, or the project's typecheck/test/build).
- [x] The affected spec's acceptance criteria are met and cite their evidence (`doctrina coverage`).

## Open questions

<!-- List unresolved decisions. Empty if none. -->
