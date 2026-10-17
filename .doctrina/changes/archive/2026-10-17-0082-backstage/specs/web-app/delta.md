# Spec Delta — capability: web-app

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/web-app/spec.md`

---

```ops
bump-version minor
append-requirement ubiquitous: The web app shall hide backstage items from the chat, show one line "<lead> is talking with <colleagues>…" while the colleagues work, put "See backstage" under the answer they led to (opening what each one handed out and answered), never notify, read aloud or mark unread for backstage work, and offer in each conversation's ⋮ menu short or detailed replies and the team's work backstage or in the chat, with the default in Settings → Conversations.
append-criterion [verified] In a browser, a chain with backstage work shows only the question and the answer, opens the backstage with every colleague's answer, shows the lead talking with the colleagues while they work, never notifies the phone of backstage work, and the group menu switches the replies and the backstage — verified by `packages/web/test/backstage.test.tsx`, `packages/web/test/group-info.test.tsx`
```
