# Change 0068-cloud-relay — cloud-relay

- **Status:** applied
- **Applied:** 2026-10-11
- **Date:** 2026-10-11
- **Owner:** Claude Code (requested by the project owner: "vamos para a fase 5")
- **Lane:** product
- **Affects specs:** cloud, cli, web-app

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

Phase 5 of the cloud migration (ADR 0020): Orbis must open from anywhere, on Cloudflare's free plan, while
the bots keep running on the user's phone. Phases 1–4 gave the account, sign-in, export/import and the
phone as a device; nothing yet carries the web app's requests to the phone.

## What

- `packages/cloud`: the Worker (static assets, session check, routing, security headers, rate limit) and
  the Durable Object `Account` (hibernating WebSockets, request/stream relay, phone-off answer, renewal).
- `packages/shared/src/relay.ts`: the relay's frames, chunking and header filtering.
- `packages/hub/src/relay/client.ts`: the hub's outbound WebSocket, answering with `inject`/`injectWS`;
  `DeviceStatus.cloud`, `PUT /api/v1/device/cloud`, `ORBIS_CLOUD_URL`.
- `orbis link --cloud`, the cloud line of `orbis link --status`; the web app's phone-off notice and the
  cloud line in Settings → Account.
- `supabase/migrations/0003_device_identity.sql` (applied); `.github/workflows/cloud.yml`.
- ADR 0024; deltas to `cloud`, `cli`, `web-app`; docs, contract and CHANGELOG.

## Scope boundaries

- Reading the history from Supabase while the phone is off (later, per the user's choice).
- The computer's live view and MCP OAuth callbacks stay on the hub (not under `/api/`).
- The first publish itself needs the user's Cloudflare secrets in GitHub.

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
- [x] End to end on the real Workers runtime (`wrangler dev` 4.142.0): sign-in check, bots created and listed
  through the cloud, the live stream, a 1.5 MB file up and down, 401 without a session, pairing 404, and
  503 `runner_offline` with the hub stopped.
- [x] `wrangler deploy --dry-run` bundles the Worker (21.9 KiB) with its bindings.
- [x] `device_identity` applied to the Supabase project; an unknown token answers 28000.

## Open questions

<!-- List unresolved decisions. Empty if none. -->
