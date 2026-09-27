# Spec Delta — capability: web-app

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/web-app/spec.md`

---

```ops
set-header Implementation: planned — in progress: roster, groups, direct and group chat, approval, draft and handoff cards, thread replies, the approvals inbox, @ autocomplete, languages and the end-to-end paths are verified; /skill autocomplete, settings and computer screens land with their capabilities
bump-version minor
append-requirement ubiquitous: The web app shall list the group conversations in the sidebar, provide a dialog that creates a group of 2 to 6 bots with a lead, and show a group's members, lead and their states above its timeline.
append-criterion [verified] In a real browser, a user creates a group in the dialog, picks a member from the `@` autocomplete, gets only that member's reply, and sees a handoff card with the receiver's answer — verified by `tests/e2e/collaboration.test.ts`.
append-criterion [verified] A handoff card shows sender, receiver, task, context and state, and the receiver's reply shows which item it answers — verified by `packages/web/test/collab.test.tsx`.
```
