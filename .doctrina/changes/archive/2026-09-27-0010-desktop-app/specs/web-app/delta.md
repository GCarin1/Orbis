# Spec Delta — capability: web-app

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/web-app/spec.md`

---

```ops
bump-version patch
append-requirement event: When the desktop app reports a notification click, the web app shall open that notification's conversation — the group, or the bot of a direct conversation.
append-criterion [verified] Opening a conversation by id selects the group, or the bot whose direct conversation it is — verified by `packages/web/test/desktop.test.tsx`.
```
