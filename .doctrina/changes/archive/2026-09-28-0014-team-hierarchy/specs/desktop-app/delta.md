# Spec Delta — capability: desktop-app

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/desktop-app/spec.md`

---

```ops
bump-version minor
append-requirement event: When the hub broadcasts a `bot.report` event, the desktop app shall raise one native notification titled with the bot's name and the report as its text, whose click opens that conversation.
append-criterion [verified] A `bot.report` event maps to one notification titled "<bot> reported back" with the report text and its conversation, once — verified by `packages/desktop/test/notifications.test.ts`.
```
