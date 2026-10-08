<!-- delta body below -->
# Spec — cloud

**Capability:** cloud
**Status:** active
**Implementation:** partial — the account database (`supabase/migrations/0001_orbis_core.sql`), signing in with an email and a password (`packages/hub/src/auth/`, `packages/web/src/account.ts`, change 0064), the `.orbis` export and its import into a hub or the cloud account (`packages/hub/src/export/`, change 0065); the runner link and the Cloudflare deploy come in later changes
**Realizes:** SC16
**Depends on:** hub-api, secrets
**Last updated:** 2026-10-08
**Version:** 0.3.0

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

### Event-driven

- When a user signs up, the system shall create their profile, which only they read and change.
- When a user signs in with their account's email and password, the system shall open the hub linked to that account (ADR 0021), its session checked against the project's public keys with no shared secret.
- When a `.orbis` file is imported into a hub, the system shall write every row in one transaction, keep a row already there as it is, write the files, skills and secrets the hub lacks (the secrets only with the right password, into the hub's own vault), schedule its routines and offer its MCP servers at once.
- When a `.orbis` file is imported into the cloud account with that account's session, the system shall write each table under the session through the database's API, adding no row twice, and keep the secrets out of the cloud.

### Unwanted-behavior (must-not)

- The system shall not give anonymous visitors any access to a cloud table.
- The system shall not keep a secret in the cloud: no vault table, no setting named `secret:…`, no routine webhook secret.
- The system shall not let an account read the token hash of its devices, nor change it.
- The system shall not import a file whose parts are missing, unlisted, changed or of a newer format, nor a file whose bots or squads take handles another bot or squad holds, writing nothing then.
- The system shall not carry over a bot's consent to work on the user's own machine, the linked account, MCP OAuth sign-ins, nor runs and approvals still waiting.

## Acceptance criteria

1. [verified] Every hub table but `secrets` has a cloud twin whose `owner_id` defaults to `auth.uid()` and cascades from `auth.users`, and there is no `secrets` table — verified by `packages/hub/test/cloud-schema.test.ts`
2. [verified] Row level security is forced on every table, with owner-only policies for the four verbs, nothing for `anon`, and owner policies on profiles — verified by `packages/hub/test/cloud-schema.test.ts`
3. [verified] A `secret:` setting is refused, routines carry no secret, the device token hash is not granted to accounts, and the sign-up function runs with an empty `search_path` — verified by `packages/hub/test/cloud-schema.test.ts`
4. [verified] A session of the account linked to a hub opens it and no other account's does; the web app signs in, creates an account, resets a password and links a hub — verified by `packages/hub/test/auth.test.ts` and `packages/web/test/account.test.tsx`
5. [verified] The file zips and unzips and refuses damaged parts and unsafe paths; the secrets open only with their password; an export holds every table but the vault, the files, the skills and the sealed secrets and nothing in clear; imported into an empty hub it brings everything (the secrets into its vault, the routine's webhook secret, the file, the skill, health), a "my computer" bot works in its own computer, a second import adds nothing, without the password everything but the secrets comes, a changed part, a handle another bot holds and a file that is no export are refused; into the cloud every table goes under the account's session in reference order as the cloud's columns take them, never a secret, never twice, and another session is refused; every exported column maps onto a cloud column of its type — verified by `packages/hub/test/export.test.ts`

## Maturity

**MVP (committed):**

- The account database with row level security (change 0063).
- Sign-in with an email and a password, export of a local hub and import into an account, the phone runner linked to the account, the web app and the API on Cloudflare.

**Future (aspirational, not committed):**

- The runner in Cloudflare Containers, for bots that answer with the phone off.

## Out of scope for this spec

- The bots' secrets in the cloud: they stay on the runner.
