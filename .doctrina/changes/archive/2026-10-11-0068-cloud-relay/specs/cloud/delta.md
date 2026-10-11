# Spec Delta — capability: cloud

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/cloud/spec.md`

---

<!-- delta body below -->

```ops
set-header Implementation: partial — the account database (`supabase/migrations/0001_orbis_core.sql`), signing in (`packages/hub/src/auth/`, change 0064), the `.orbis` export and import (`packages/hub/src/export/`, change 0065), this hub as a device of the account sending its rows (`supabase/migrations/0002_devices.sql`, `packages/hub/src/sync/`, change 0066), and the Cloudflare cloud relaying the web app to the account's hub (`packages/cloud/`, `packages/hub/src/relay/`, `supabase/migrations/0003_device_identity.sql`, change 0068); reading the history while the phone is off comes later
set-header Last updated: 2026-10-11
bump-version minor
append-requirement ubiquitous: The system shall serve the web app from the cloud's static assets and relay every other request under `/api/` and `/v1/` to the account's own hub through one Durable Object per account, without reimplementing the hub's routes nor keeping any secret beyond the Supabase project's address and publishable key (ADR 0024).
append-requirement event: When a hub is linked as a device and knows its cloud (`ORBIS_CLOUD_URL`, else `orbis link --cloud`, else the published cloud), the system shall open one WebSocket from the hub out to the cloud with the device's token in the upgrade's Authorization header, have the cloud check the token with Supabase before handing the socket to the token's account, and keep only the newest hub of an account connected.
append-requirement event: When a browser calls the cloud's API, the system shall check its Supabase session against the project's published keys before relaying it, and the hub shall check it again as the session of the account linked to it; a stream ticket or file key shall name its account so the cloud routes it, the hub checking its own part.
append-requirement event: When no hub of the account is connected, the system shall answer the account's API with 503 `runner_offline`, and a hub leaving shall answer the requests waiting the same way and close the account's open streams.
append-requirement unwanted: The cloud shall not relay pairing, the hub's device or account links, nor unlinking the account; shall not pass the device's token, cookies or its own headers on to an account; shall not keep a relay open more than an hour without checking its token again; and shall answer every page and API call with HSTS, a CSP of its own origin and the Supabase project, `X-Frame-Options: DENY`, `nosniff` and `Referrer-Policy: no-referrer`.
append-criterion [verified] The Worker serves the app with its security headers and the one inline script by hash, answers where accounts sign in, relays the API only with a valid session of the account it names and never cookies or its own headers, keeps pairing and the hub's links off the cloud, hands out tickets and file keys that name the account and routes them there, takes a hub's relay only with a device token Supabase knows (never passing it on), and limits by address; the account's object says the phone is off without a hub, relays requests and answers in pieces both ways, relays streams under their own id, answers waiting requests and closes streams when the hub leaves, keeps the newest hub and renews an hour-old relay — verified by `packages/cloud/test/cloud.test.ts`
append-criterion [verified] Once linked the hub opens the relay with its token in the Authorization header and never in the address, answers relayed requests with its own routes and auth (no session, another account or a session managing the device refused; only the API crosses), carries a 1.2 MB upload and download in pieces, relays its event stream opened with a one-time ticket, closes when unlinked and stays closed when the cloud says the device was revoked — verified by `packages/hub/test/relay.test.ts`
```
