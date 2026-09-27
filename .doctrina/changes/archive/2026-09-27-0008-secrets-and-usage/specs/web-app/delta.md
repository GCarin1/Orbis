# Spec Delta — capability: web-app

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/web-app/spec.md`

---

```ops
set-header Implementation: planned — in progress: roster, groups, direct and group chat, approval, draft, handoff, routine and secret-request cards, thread replies, the approvals inbox, @ and / autocomplete, the skills, usage and routines screens, the computer side panel and full screen with takeover, languages and the end-to-end paths are verified; the bot settings screen lands with templates
bump-version minor
append-criterion [verified] The secret-request card posts the masked value to the vault route (or declines), and the usage screen shows runs, tokens, cost, the subscription part and the cap per bot — verified by `packages/web/test/secrets-usage.test.tsx`.
append-criterion [verified] In a real browser, a user answers a bot's secret request in the masked card, the bot's command uses the value, and the value appears nowhere on the page — verified by `tests/e2e/secrets.test.ts`.
```
