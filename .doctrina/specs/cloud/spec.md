<!-- delta body below -->
# Spec — cloud

**Capability:** cloud
**Status:** active
**Implementation:** partial — the account database (`supabase/migrations/0001_orbis_core.sql`), signing in with two-step verification (`packages/hub/src/auth/`, changes 0064 and 0070), the `.orbis` export and import (`packages/hub/src/export/`, change 0065), the hub as a device of the account keeping a copy there (`supabase/migrations/0002_devices.sql`, `packages/hub/src/sync/`, change 0066), and the hub on an always-on server serving the app over HTTPS (`deploy/`, `scripts/server/orbis-server.sh`, changes 0069 and 0070)
**Realizes:** SC16
**Depends on:** hub-api, secrets
**Last updated:** 2026-10-11
**Version:** 0.8.0

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
- The system shall serve the web app and its API from the user's own always-on server, with Caddy in front for HTTPS (a certificate it gets and renews itself) and only ports 22, 80 and 443 open; the hub's own port shall listen on the server only (ADR 0026).
- The system shall publish its server image, ready for amd64 and arm64, so a home server compiles nothing.

### Event-driven

- When a user signs up, the system shall create their profile, which only they read and change.
- When a user signs in with their account's email and password, the system shall open the hub linked to that account (ADR 0021), its session checked against the project's public keys with no shared secret.
- When a `.orbis` file is imported into a hub, the system shall write every row in one transaction, keep a row already there as it is, write the files, skills and secrets the hub lacks (the secrets only with the right password, into the hub's own vault), schedule its routines and offer its MCP servers at once.
- When a `.orbis` file is imported into the cloud account with that account's session, the system shall write each table under the session through the database's API, adding no row twice, and keep the secrets out of the cloud.
- When a hub is linked to an account with the account's email and password, the system shall register it as a device with a token of 32 random bytes, answered once, kept in the hub's vault and only as its SHA-256 in the cloud (ADR 0023).
- When a row of a synced table changes while a hub is linked as a device, the system shall record it (but this hub's own settings) and send, every 15 seconds and table by table in the order of their references, the latest state of each changed row and the keys of the deleted ones through the cloud's device function, which writes them only under the device's owner.
- When the account revokes a device, the system shall refuse its token at once; the hub shall then send nothing more, forget its token and say it was revoked.
- When the hub is opened at `ORBIS_PUBLIC_URL`, the system shall take the visitor's address from its proxy only on loopback and private networks and count refused sign-ins per visitor, sign MCP servers in back to that address, and refuse to start with an `ORBIS_TOKEN` shorter than 24 characters.
- When two-step verification is on for the linked account, the system shall refuse every account session whose second step (an authenticator's code, `aal2`) was not given; only the hub's token or an `aal2` session shall turn it on or off, and the hub's token stays the recovery key.
- When the user runs `orbis-server token`, the system shall print the hub's token; `orbis-server update` shall pull Orbis and rebuild the hub and Caddy, keeping the data in its volume.
- When the user runs `orbis-server install` on an always-on Linux server, the system shall install Docker when missing, check Orbis out, keep the address (the user's domain, else `<public-ip>.sslip.io`) and the Claude plan's token in a `deploy/.env` readable only by its owner, open ports 80 and 443 in the server's firewall, and start the hub with Caddy; `import` shall bring a `.orbis` file into the hub and remove the copy after (ADR 0026).
- When a hub is linked as a device with `orbis-server link`, the system shall keep a copy of its data in the account as any device does, and the app shall keep talking to the hub itself.
- When a person's Orbis is deployed on a home server from `deploy/umbrel/docker-compose.yml`, the system shall run their own hub with its own data volume and memory ceiling, publish no port, and reach it only through the stack's own Tailscale node, which serves `https://orbis-<name>.<tailnet>.ts.net` to the hub over the stack's private network and never through Funnel; a stack without its name, tailnet or auth key shall not start (ADR 0027).

### Unwanted-behavior (must-not)

- The system shall not give anonymous visitors any access to a cloud table.
- The system shall not keep a secret in the cloud: no vault table, no setting named `secret:…`, no routine webhook secret.
- The system shall not let an account read the token hash of its devices, nor change it.
- The system shall not import a file whose parts are missing, unlisted, changed or of a newer format, nor a file whose bots or squads take handles another bot or squad holds, writing nothing then.
- The system shall not carry over a bot's consent to work on the user's own machine, the linked account, MCP OAuth sign-ins, nor runs and approvals still waiting.
- The system shall not send a secret, the device's token or this hub's own settings to the cloud, nor let a session alone link or unlink a hub as a device, nor take more than 10 active devices per account or 500 rows a call.
- The system shall not answer a page or API call without HSTS, a CSP limited to its own origin and the Supabase project (the one inline script by hash), `X-Frame-Options: DENY` (SAMEORIGIN for the computer's live view, which the app frames), `nosniff` and `Referrer-Policy: no-referrer`.

## Acceptance criteria

1. [verified] Every hub table but `secrets` has a cloud twin whose `owner_id` defaults to `auth.uid()` and cascades from `auth.users`, and there is no `secrets` table — verified by `packages/hub/test/cloud-schema.test.ts`
2. [verified] Row level security is forced on every table, with owner-only policies for the four verbs, nothing for `anon`, and owner policies on profiles — verified by `packages/hub/test/cloud-schema.test.ts`
3. [verified] A `secret:` setting is refused, routines carry no secret, the device token hash is not granted to accounts, and the sign-up function runs with an empty `search_path` — verified by `packages/hub/test/cloud-schema.test.ts`
4. [verified] A session of the account linked to a hub opens it and no other account's does; the web app signs in, creates an account, resets a password and links a hub — verified by `packages/hub/test/auth.test.ts` and `packages/web/test/account.test.tsx`
5. [verified] The file zips and unzips and refuses damaged parts and unsafe paths; the secrets open only with their password; an export holds every table but the vault, the files, the skills and the sealed secrets and nothing in clear; imported into an empty hub it brings everything (the secrets into its vault, the routine's webhook secret, the file, the skill, health), a "my computer" bot works in its own computer, a second import adds nothing, without the password everything but the secrets comes, a changed part, a handle another bot holds and a file that is no export are refused; into the cloud every table goes under the account's session in reference order as the cloud's columns take them, never a secret, never twice, and another session is refused; every exported column maps onto a cloud column of its type — verified by `packages/hub/test/export.test.ts`
6. [verified] Linking signs in, keeps the device's token in the vault and never answers it, links the account and sends every row once; each change goes once with the row's latest state, deletions by key, bots before their conversations; nothing is queued while not linked; what waits stays while the cloud is down; once revoked nothing is sent and the token is forgotten; another account, a second link and a session alone are refused; unlinking leaves nothing; an export carries neither the device nor its token — verified by `packages/hub/test/sync.test.ts`
7. [verified] Caddy serves Orbis at `$ORBIS_DOMAIN` to the hub with HSTS, `nosniff`, `Referrer-Policy`, `X-Frame-Options: DENY` and a CSP without `unsafe-eval` or inline scripts but the app's one, by its hash; the compose file publishes only Caddy's 80 and 443 and the hub's port on the machine only, with no tunnel — verified by `packages/hub/test/cloud-kit.test.ts`
8. [verified] Behind its proxy a hub refuses a token under 24 characters, makes one visitor wait after 20 refused tries while another and the owner still get in — verified by `packages/hub/test/auth.test.ts`
9. [verified] With two-step verification on, a session of the password alone is refused and one with the second step opens the hub; only such a session or the hub's token turns it on or off; sessions report their `aal` — verified by `packages/hub/test/auth.test.ts`
10. [verified] `orbis-server.sh` installs Docker when missing, clones Orbis, writes `deploy/.env` readable only by its owner with the HTTPS address (`<ip>.sslip.io` without a domain), opens 80 and 443, starts the hub with Caddy, takes the user's own domain, links the hub, shows its token, imports a `.orbis` file and removes it after, lists its commands and says when Orbis is not installed — verified by `packages/hub/test/server-script.test.ts`
11. [verified] A person's stack publishes no port, serves HTTPS on 443 of its own Tailscale node to `http://orbis:7420` and never Funnel, writes the serve file before Tailscale's own start, gives the hub the published image, its own data and node volumes, its address and a memory ceiling, restarts on its own, writes no key in the file and refuses to start without its name, tailnet or auth key; the image is published for amd64 and arm64 — verified by `packages/hub/test/cloud-kit.test.ts`

## Maturity

**MVP (committed):**

- The account database with row level security (change 0063).
- Sign-in with an email and a password, export of a local hub and import into an account, the phone runner linked to the account, the web app and the API on Cloudflare.

**Future (aspirational, not committed):**

- The runner in Cloudflare Containers, for bots that answer with the phone off.

## Out of scope for this spec

- The bots' secrets in the cloud: they stay on the runner.
