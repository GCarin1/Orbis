# Change 0066-runner-link — runner-link

- **Status:** applied
- **Applied:** 2026-10-08
- **Date:** 2026-10-08
- **Owner:** Orbis maintainers
- **Lane:** runtime (confident; signals: runner) — opened anyway (--force)
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

Phase 4 of moving Orbis to the cloud: the phone that runs the bots joins
the account as a device with a token of its own, revocable from the
account, and keeps the account's copy up to date (ADR 0023).

## What

- Cloud: `supabase/migrations/0002_devices.sql` adds `register_device`,
  `device_sync`, `device_unlink` and the internal `device_owner`.
- Hub:
  - migration 15 (`sync_outbox` and its triggers);
  - `packages/hub/src/sync/service.ts` (link, the sync every 15 s,
    revocation, unlink, the `/device` routes);
  - `HubAuth.setLinked`;
  - exports leave the device out.
- CLI: `orbis link` and `orbis unlink`; `orbis-phone link` and `unlink`.
- Web: Settings → Account, the devices (`DeviceSettings.tsx`).
- Specs `cloud`, `cli` and `web-app`, contract `hub-surface`, ADR 0023, and
  the guide `docs/cloud-migration.md`.

## Scope boundaries

- From the phone to the cloud only. What the cloud's app writes reaches the
  phone with the Durable Object (phase 5).

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
