# Spec Delta — capability: web-app

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/web-app/spec.md`

---

<!-- delta body below -->

```ops
set-header Last updated: 2026-10-11
bump-version minor
append-requirement event: When the app runs through the Orbis cloud and the cloud answers that the phone running the hub is off (`runner_offline`), the app shall say "your phone is off or offline: your bots answer when it is back" instead of reconnecting, and Settings → Account shall show whether this hub's relay to the cloud is connected.
append-criterion [verified] With the cloud answering `runner_offline` the app says the phone is off, not "reconnecting" — verified by `packages/web/test/phone-off.test.tsx`; Settings → Account shows this hub connected to its cloud — verified by `packages/web/test/devices.test.tsx`
```
