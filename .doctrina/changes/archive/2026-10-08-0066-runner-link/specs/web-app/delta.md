# Spec Delta — capability: web-app

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/web-app/spec.md`

---

<!-- delta body below -->

```ops
set-header Last updated: 2026-10-08
bump-version minor
append-requirement event: When the user opens Settings → Account, the web app shall show this hub as a device of the account — linking it with a name and the account's email and password, what waits to be sent and when it last sent, sending now, unlinking, and that the account revoked it — and list the account's devices with the account's session, each revocable.
append-criterion [verified] Settings → Account links this hub with the account's email and password, shows what waits and sends now, unlinks, says when the account revoked it, and lists the account's devices with its session and revokes one — verified by `packages/web/test/devices.test.tsx`
```
