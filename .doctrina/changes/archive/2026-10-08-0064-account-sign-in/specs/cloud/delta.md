# Spec Delta — capability: cloud

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/cloud/spec.md`

---

<!-- delta body below -->

```ops
set-header Implementation: partial — the account database (`supabase/migrations/0001_orbis_core.sql`) and signing in with an email and a password (`packages/hub/src/auth/`, `packages/web/src/account.ts`, change 0064); export and import, the runner link and the Cloudflare deploy come in later changes
set-header Last updated: 2026-10-08
bump-version minor
append-requirement event: When a user signs in with their account's email and password, the system shall open the hub linked to that account (ADR 0021), its session checked against the project's public keys with no shared secret.
append-criterion [verified] A session of the account linked to a hub opens it and no other account's does; the web app signs in, creates an account, resets a password and links a hub — verified by `packages/hub/test/auth.test.ts` and `packages/web/test/account.test.tsx`
```
