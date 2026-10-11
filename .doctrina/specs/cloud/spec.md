<!-- delta body below -->
# Spec — cloud

**Capability:** cloud
**Status:** active
**Implementation:** partial — the account database (`supabase/migrations/0001_orbis_core.sql`), signing in (`packages/hub/src/auth/`, change 0064), the `.orbis` export and import (`packages/hub/src/export/`, change 0065), this hub as a device of the account sending its rows (`supabase/migrations/0002_devices.sql`, `packages/hub/src/sync/`, change 0066), and the Cloudflare cloud relaying the web app to the account's hub (`packages/cloud/`, `packages/hub/src/relay/`, `supabase/migrations/0003_device_identity.sql`, change 0068); reading the history while the phone is off comes later
**Realizes:** SC16
**Depends on:** hub-api, secrets
**Last updated:** 2026-10-11
**Version:** 0.5.0

## Purpose

Orbis accounts in the cloud. A user signs in with an email and a password
and keeps their bots, conversations and data in their own account. The
data lives in Supabase Postgres, and row level security closes each
account to every other one. The web app and the API run on Cloudflare's
free tier. The user's phone keeps running the bots, with its own SQLite
and its secrets, and syncs with the account (ADR 0020).

## Requirements (EARS)

### Ubiquitous

- The system shall keep, in the cloud database, a table for every table of the hub but the vault, each row owned by one account through `owner_id`, which defaults to the signed-in user and is deleted with them.
- The system shall key every cloud table by `(owner_id, id)` and make every reference between rows carry `owner_id`, so a row only points at rows of its own account.
- The system shall enable and force row level security on every cloud table, with policies that let the signed-in user read, add, change and delete only rows whose `owner_id` is theirs.
- The system shall keep, per runner device of an account, its name, the SHA-256 hash of its token, when it was last seen and when it was revoked.
- The system shall export everything a hub keeps as one `.orbis` file: a manifest with the SHA-256 of every part, every table but the vault, the CLI sessions and the search index, the conversations' files and the skills, and, only when the user gives a password of at least 10 characters, the secrets sealed by it with scrypt and AES-256-GCM (ADR 0022).
- The system shall serve the web app from the cloud's static assets and relay every other request under `/api/` and `/v1/` to the account's own hub through one Durable Object per account, without reimplementing the hub's routes nor keeping any secret beyond the Supabase project's address and publishable key (ADR 0024).

### Event-driven

- When a user signs up, the system shall create their profile, which only they read and change.
- When a user signs in with their account's email and password, the system shall open the hub linked to that account (ADR 0021), its session checked against the project's public keys with no shared secret.
- When a `.orbis` file is imported into a hub, the system shall write every row in one transaction, keep a row already there as it is, write the files, skills and secrets the hub lacks (the secrets only with the right password, into the hub's own vault), schedule its routines and offer its MCP servers at once.
- When a `.orbis` file is imported into the cloud account with that account's session, the system shall write each table under the session through the database's API, adding no row twice, and keep the secrets out of the cloud.
- When a hub is linked to an account with the account's email and password, the system shall register it as a device with a token of 32 random bytes, answered once, kept in the hub's vault and only as its SHA-256 in the cloud (ADR 0023).
- When a row of a synced table changes while a hub is linked as a device, the system shall record it (but this hub's own settings) and send, every 15 seconds and table by table in the order of their references, the latest state of each changed row and the keys of the deleted ones through the cloud's device function, which writes them only under the device's owner.
- When the account revokes a device, the system shall refuse its token at once; the hub shall then send nothing more, forget its token and say it was revoked.
- When a hub is linked as a device and knows its cloud (`ORBIS_CLOUD_URL`, else `orbis link --cloud`, else the published cloud), the system shall open one WebSocket from the hub out to the cloud with the device's token in the upgrade's Authorization header, have the cloud check the token with Supabase before handing the socket to the token's account, and keep only the newest hub of an account connected.
- When a browser calls the cloud's API, the system shall check its Supabase session against the project's published keys before relaying it, and the hub shall check it again as the session of the account linked to it; a stream ticket or file key shall name its account so the cloud routes it, the hub checking its own part.
- When no hub of the account is connected, the system shall answer the account's API with 503 `runner_offline`, and a hub leaving shall answer the requests waiting the same way and close the account's open streams.

### Unwanted-behavior (must-not)

- The system shall not give anonymous visitors any access to a cloud table.
- The system shall not keep a secret in the cloud: no vault table, no setting named `secret:…`, no routine webhook secret.
- The system shall not let an account read the token hash of its devices, nor change it.
- The system shall not import a file whose parts are missing, unlisted, changed or of a newer format, nor a file whose bots or squads take handles another bot or squad holds, writing nothing then.
- The system shall not carry over a bot's consent to work on the user's own machine, the linked account, MCP OAuth sign-ins, nor runs and approvals still waiting.
- The system shall not send a secret, the device's token or this hub's own settings to the cloud, nor let a session alone link or unlink a hub as a device, nor take more than 10 active devices per account or 500 rows a call.
- The cloud shall not relay pairing, the hub's device or account links, nor unlinking the account; shall not pass the device's token, cookies or its own headers on to an account; shall not keep a relay open more than an hour without checking its token again; and shall answer every page and API call with HSTS, a CSP of its own origin and the Supabase project, `X-Frame-Options: DENY`, `nosniff` and `Referrer-Policy: no-referrer`.

## Acceptance criteria

1. [verified] Every hub table but `secrets` has a cloud twin whose `owner_id` defaults to `auth.uid()` and cascades from `auth.users`, and there is no `secrets` table — verified by `packages/hub/test/cloud-schema.test.ts`
2. [verified] Row level security is forced on every table, with owner-only policies for the four verbs, nothing for `anon`, and owner policies on profiles — verified by `packages/hub/test/cloud-schema.test.ts`
3. [verified] A `secret:` setting is refused, routines carry no secret, the device token hash is not granted to accounts, and the sign-up function runs with an empty `search_path` — verified by `packages/hub/test/cloud-schema.test.ts`
4. [verified] A session of the account linked to a hub opens it and no other account's does; the web app signs in, creates an account, resets a password and links a hub — verified by `packages/hub/test/auth.test.ts` and `packages/web/test/account.test.tsx`
5. [verified] The file zips and unzips and refuses damaged parts and unsafe paths; the secrets open only with their password; an export holds every table but the vault, the files, the skills and the sealed secrets and nothing in clear; imported into an empty hub it brings everything (the secrets into its vault, the routine's webhook secret, the file, the skill, health), a "my computer" bot works in its own computer, a second import adds nothing, without the password everything but the secrets comes, a changed part, a handle another bot holds and a file that is no export are refused; into the cloud every table goes under the account's session in reference order as the cloud's columns take them, never a secret, never twice, and another session is refused; every exported column maps onto a cloud column of its type — verified by `packages/hub/test/export.test.ts`
6. [verified] Linking signs in, keeps the device's token in the vault and never answers it, links the account and sends every row once; each change goes once with the row's latest state, deletions by key, bots before their conversations; nothing is queued while not linked; what waits stays while the cloud is down; once revoked nothing is sent and the token is forgotten; another account, a second link and a session alone are refused; unlinking leaves nothing; an export carries neither the device nor its token — verified by `packages/hub/test/sync.test.ts`
7. [verified] The Worker serves the app with its security headers and the one inline script by hash, answers where accounts sign in, relays the API only with a valid session of the account it names and never cookies or its own headers, keeps pairing and the hub's links off the cloud, hands out tickets and file keys that name the account and routes them there, takes a hub's relay only with a device token Supabase knows (never passing it on), and limits by address; the account's object says the phone is off without a hub, relays requests and answers in pieces both ways, relays streams under their own id, answers waiting requests and closes streams when the hub leaves, keeps the newest hub and renews an hour-old relay — verified by `packages/cloud/test/cloud.test.ts`
8. [verified] Once linked the hub opens the relay with its token in the Authorization header and never in the address, answers relayed requests with its own routes and auth (no session, another account or a session managing the device refused; only the API crosses), carries a 1.2 MB upload and download in pieces, relays its event stream opened with a one-time ticket, closes when unlinked and stays closed when the cloud says the device was revoked — verified by `packages/hub/test/relay.test.ts`

## Maturity

**MVP (committed):**

- The account database with row level security (change 0063).
- Sign-in with an email and a password, export of a local hub and import into an account, the phone runner linked to the account, the web app and the API on Cloudflare.

**Future (aspirational, not committed):**

- The runner in Cloudflare Containers, for bots that answer with the phone off.

## Out of scope for this spec

- The bots' secrets in the cloud: they stay on the runner.
