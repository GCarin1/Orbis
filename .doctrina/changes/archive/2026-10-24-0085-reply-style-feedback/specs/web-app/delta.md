# Spec Delta — capability: web-app

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/web-app/spec.md`

---

```ops
bump-version patch
append-requirement ubiquitous: The web app shall show a conversation's short replies and team backstage as on/off switches in its ⋮ menu, which stays open to show the switch flip, and show each switch as a line in the chat.
append-criterion [verified] The group menu shows both switches checked by default and flips them; the chat shows "You turned on short replies" and the backstage line — verified by `packages/web/test/group-info.test.tsx`, `packages/web/test/backstage.test.tsx`
```
