# Spec Delta — capability: web-app

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/web-app/spec.md`

---

```ops
set-header Implementation: planned — in progress: roster, groups, direct and group chat, approval, draft and handoff cards, thread replies, the approvals inbox, @ autocomplete, the computer side panel and full screen with takeover, languages and the end-to-end paths are verified; /skill autocomplete and the settings, skills, routines and usage screens land with their capabilities
bump-version minor
append-criterion [verified] The computer panel shows the computer's state, the latest screenshot (or noVNC for a desktop), and sends Take over and Hand back — verified by `packages/web/test/computer.test.tsx`.
append-criterion [verified] In a real browser, after a bot opens a page, the user sees that page in the computer panel, takes over, hands back and switches to full screen — verified by `tests/e2e/computer.test.ts`.
```
