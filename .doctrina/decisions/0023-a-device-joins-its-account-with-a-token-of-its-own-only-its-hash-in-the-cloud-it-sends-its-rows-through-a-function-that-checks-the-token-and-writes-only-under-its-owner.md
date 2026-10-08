# ADR 0023 — A device joins its account with a token of its own, only its hash in the cloud; it sends its rows through a function that checks the token and writes only under its owner

- **Status:** accepted
- **Scope:** cloud, cli, web-app, secrets
- **Date:** 2026-10-08
- **Deciders:** project owner (requirement: the phone runner linked to the account, "token de dispositivo revogável"; "Pode começar a fase 4"), Claude Code
- **Supersedes:** —
- **Superseded by:** —
- **Evidence:** `supabase/migrations/0002_devices.sql`, `packages/hub/src/sync/service.ts`, `packages/cli/src/commands/link.ts`, `packages/web/src/components/DeviceSettings.tsx`
- **Landed:** —

## Context

ADR 0020 keeps the bots running on the phone, and its SQLite as the working
copy, syncing into the account. The phone's hub must reach the account
without anyone signed in: a session lasts an hour, and the hub must never
keep the account's password. The cloud's Worker that could hold a service
key does not exist yet (phase 5). Row level security lets a session write
only its own rows.

## Decision

- **A device token per hub.** Linking signs in once: with the email and
  password at `orbis link` or in Settings → Account, the hub asks Supabase
  Auth itself. Then `register_device`, run under that session, makes 32
  random bytes and answers them once. The cloud keeps only their SHA-256 in
  `devices`, which the account cannot read. The hub keeps the token in its
  vault. The session is not kept.
- **What changes here, sent there.**
  - Triggers record each insert, update and delete of the synced tables in
    `sync_outbox` (migration 15). They run only while the device is linked,
    and leave out the vault's settings and this hub's own (account, device,
    activity).
  - Every 15 s the hub sends, table by table in the order of their
    references, the latest state of each changed row (as the cloud's
    columns take it, `ExportService.cloudRow`) and the keys of the deleted.
  - Linking queues every row once. A failure waits and tries again, longer
    each time.
- **One checked door into the account.** `device_sync(token, table,
  upserts, deletes)` is a `security definer` function with an empty
  `search_path`, executable without a session:
  - it finds the device by the token's hash, not revoked, and notes when it
    was last seen;
  - it takes only the synced tables and at most 500 rows a call;
  - it writes every row with `owner_id` set to the device's owner;
  - the columns and keys it writes come from the catalog, never from the
    payload.

  `device_owner` stays internal (no role may run it).
- **Revocable.**
  - The account revokes a device in Settings → Account (its own session,
    row level security, `revoked_at`), and the hub unlinks itself with
    `device_unlink`.
  - A revoked token stops `device_sync` at once. The hub then sends nothing
    more, forgets its token and says so.
  - At most 10 devices are active per account.
- Only the hub's token links or unlinks this hub as a device; an account
  session opening the hub cannot. Exports never carry the device's settings
  nor its token.
- This change sends from the phone to the cloud. What the cloud's app writes
  reaches the phone with the Durable Object (phase 5).

## Alternatives considered

1. Keep the account's refresh token on the phone: a stolen phone would hold
   the account itself, and a refresh token cannot be limited to syncing.
2. A service role key on the phone: the key opens every account.
3. A full table copy on every sync: too much for a phone on mobile data.
   The outbox sends only what changed.
4. Write through PostgREST tables with a custom JWT per device: it needs the
   project's JWT signing secret, which no hub should hold.

## Consequences

**Positive**

- A phone joins the account once, and a lost phone is cut off from the
  account's page in one tap. Its token cannot read anything.
- The account holds an up-to-date copy of every hub, ready for the cloud's
  app.

**Negative**

- `device_sync` and `device_unlink` are open to `anon`: the token is the
  only proof. It is 256 random bits, and only its hash is kept.
- The device's copy wins: a row changed in the cloud is overwritten by the
  phone's next change. This holds until the cloud writes too (phase 5).

**Neutral**

- `sync.test.ts` and `cloud-schema.test.ts` keep the outbox, the synced
  tables and the cloud schema in step.
