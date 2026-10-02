# Spec Delta — capability: web-app

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/web-app/spec.md`

---

```ops
bump-version minor
append-requirement ubiquitous: The web app shall offer, in the `chat-http` brain's advanced settings, a box to give new chats a title, checked by default, that saves `chat.titles: false` when cleared.
append-criterion [verified] The title box is checked for a bot with no setting, and clearing it saves the brain with `chat: { titles: false }` — verified by `packages/web/test/chat-http.test.tsx`.
```
