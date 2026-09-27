# Spec Delta — capability: web-app

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/web-app/spec.md`

---

```ops
set-header Implementation: planned — in progress: roster, groups, direct and group chat, approval, draft, handoff and routine cards, thread replies, the approvals inbox, @ and / autocomplete, the skills screen, the routines panel, the computer side panel and full screen with takeover, languages and the end-to-end paths are verified; the settings and usage screens land with their capabilities
bump-version minor
set-criterion 4: verified
append-criterion [verified] In a real browser, a user writes a skill in the skills screen, invokes it with the `/` autocomplete, and creates, tests and enables a routine whose cards appear in the conversation — verified by `tests/e2e/skills-routines.test.ts`.
```
