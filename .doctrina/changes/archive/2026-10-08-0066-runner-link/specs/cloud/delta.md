# Spec Delta — capability: cloud

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/cloud/spec.md`

---

<!-- delta body below -->

```ops
set-header Implementation: partial — the account database (`supabase/migrations/0001_orbis_core.sql`), signing in (`packages/hub/src/auth/`, change 0064), the `.orbis` export and import (`packages/hub/src/export/`, change 0065), and this hub as a device of the account sending its rows (`supabase/migrations/0002_devices.sql`, `packages/hub/src/sync/`, change 0066); the Cloudflare deploy comes in a later change
set-header Last updated: 2026-10-08
bump-version minor
append-requirement event: When a hub is linked to an account with the account's email and password, the system shall register it as a device with a token of 32 random bytes, answered once, kept in the hub's vault and only as its SHA-256 in the cloud (ADR 0023).
append-requirement event: While a hub is linked as a device, the system shall record each change of the synced tables but this hub's own settings and send, every 15 seconds and table by table in the order of their references, the latest state of each changed row and the keys of the deleted ones through the cloud's device function, which writes them only under the device's owner.
append-requirement event: When the account revokes a device, the system shall refuse its token at once; the hub shall then send nothing more, forget its token and say it was revoked.
append-requirement unwanted: The system shall not send a secret, the device's token or this hub's own settings to the cloud, nor let a session alone link or unlink a hub as a device, nor take more than 10 active devices per account or 500 rows a call.
append-criterion [verified] Linking signs in, keeps the device's token in the vault and never answers it, links the account and sends every row once; each change goes once with the row's latest state, deletions by key, bots before their conversations; nothing is queued while not linked; what waits stays while the cloud is down; once revoked nothing is sent and the token is forgotten; another account, a second link and a session alone are refused; unlinking leaves nothing; an export carries neither the device nor its token — verified by `packages/hub/test/sync.test.ts`
```
