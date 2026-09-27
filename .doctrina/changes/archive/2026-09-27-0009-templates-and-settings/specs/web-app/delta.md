# Spec Delta — capability: web-app

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/web-app/spec.md`

---

```ops
set-header Implementation: verified — roster, groups, timeline and every card type, composer autocomplete, the skills, usage, routines, computer and bot settings screens, approvals inbox, languages, PWA and the end-to-end paths
bump-version minor
append-criterion [verified] The bot settings panel edits identity, brain, policy rules and grants, computer, allowlists and the spend cap in one patch, and asks before deleting — verified by `packages/web/test/settings.test.tsx`.
append-criterion [verified] In a real browser, a user edits a bot's settings, exports it as a template file and imports that file as a new bot — verified by `tests/e2e/templates.test.ts`.
```
