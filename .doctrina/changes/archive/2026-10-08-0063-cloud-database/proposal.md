# Change 0063-cloud-database — cloud-database

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

Phase 1 of moving Orbis to the cloud (Cloudflare + Supabase, accounts with an
email and a password, the data of local hubs brought along): the account
database, closed to every other account by row level security, before any
backend is exposed (ADR 0020).

## What

- New capability `cloud` (Realizes SC16, ADR 0020).
- `supabase/migrations/0001_orbis_core.sql`: the twins of the hub's tables
  with `owner_id`, composite keys, forced row level security, `profiles`
  with its sign-up trigger, `devices` with a hidden token hash, foreign key
  indexes. Applied to the Supabase project `orbis` (`tqjxkgxmnkypzbpirztw`,
  `sa-east-1`, free plan).
- `packages/hub/test/cloud-schema.test.ts` keeps the schema in step with the
  hub's migrations.
- Guide `docs/cloud-migration.md` (architecture, phases, security check,
  the Auth settings of the dashboard).

## Scope boundaries

- The hub, the web app and the Android app are unchanged: sign-in, export
  and import, the runner link and the deploy are later changes.

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

- [x] Isolation checked on the live project: user B reads none of A's rows, cannot write as A, cannot add a `secret:` setting nor read a device token hash; `anon` reads nothing. The security and performance advisors report no finding.
