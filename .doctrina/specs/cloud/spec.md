<!-- delta body below -->
# Spec — cloud

**Capability:** cloud
**Status:** active
**Implementation:** partial — the account database (`supabase/migrations/0001_orbis_core.sql`) and signing in with an email and a password (`packages/hub/src/auth/`, `packages/web/src/account.ts`, change 0064); export and import, the runner link and the Cloudflare deploy come in later changes
**Realizes:** SC16
**Depends on:** hub-api, secrets
**Last updated:** 2026-10-08
**Version:** 0.2.0

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

### Event-driven

- When a user signs up, the system shall create their profile, which only they read and change.
- When a user signs in with their account's email and password, the system shall open the hub linked to that account (ADR 0021), its session checked against the project's public keys with no shared secret.

### Unwanted-behavior (must-not)

- The system shall not give anonymous visitors any access to a cloud table.
- The system shall not keep a secret in the cloud: no vault table, no setting named `secret:…`, no routine webhook secret.
- The system shall not let an account read the token hash of its devices, nor change it.

## Acceptance criteria

1. [verified] Every hub table but `secrets` has a cloud twin whose `owner_id` defaults to `auth.uid()` and cascades from `auth.users`, and there is no `secrets` table — verified by `packages/hub/test/cloud-schema.test.ts`
2. [verified] Row level security is forced on every table, with owner-only policies for the four verbs, nothing for `anon`, and owner policies on profiles — verified by `packages/hub/test/cloud-schema.test.ts`
3. [verified] A `secret:` setting is refused, routines carry no secret, the device token hash is not granted to accounts, and the sign-up function runs with an empty `search_path` — verified by `packages/hub/test/cloud-schema.test.ts`
4. [verified] A session of the account linked to a hub opens it and no other account's does; the web app signs in, creates an account, resets a password and links a hub — verified by `packages/hub/test/auth.test.ts` and `packages/web/test/account.test.tsx`

## Maturity

**MVP (committed):**

- The account database with row level security (change 0063).
- Sign-in with an email and a password, export of a local hub and import into an account, the phone runner linked to the account, the web app and the API on Cloudflare.

**Future (aspirational, not committed):**

- The runner in Cloudflare Containers, for bots that answer with the phone off.

## Out of scope for this spec

- The bots' secrets in the cloud: they stay on the runner.
