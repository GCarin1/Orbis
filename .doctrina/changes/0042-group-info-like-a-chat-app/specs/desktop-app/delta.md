# Spec Delta — capability: desktop-app

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/desktop-app/spec.md`

---

```ops
bump-version minor
append-requirement unwanted: The desktop app shall not raise a notification for a manager's report in a conversation the user muted; approval and secret requests there still notify.
append-criterion [verified] A report in a muted group raises no notification, an approval there still does, and the mute follows the stream's conversation updates and deletions — verified by `packages/desktop/test/notifications.test.ts`.
```
