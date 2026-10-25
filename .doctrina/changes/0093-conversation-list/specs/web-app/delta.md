# Spec Delta — capability: web-app

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/web-app/spec.md`

---

```ops
bump-version patch
append-requirement ubiquitous: The web app shall mark a conversation's squad with a ring of its colour around the face, keep the dot for unread, and preview each conversation with its last message, inviting a first one ("Say hi to …") where there is none.
append-criterion [verified] A bot with no message reads "Say hi to Bob" and a squad's bot wears the squad's ring, with no dot by its name — verified by `packages/web/test/collab.test.tsx`
```
