# Spec Delta — capability: web-app

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/web-app/spec.md`

---

```ops
set-header Implementation: verified — roster, groups, timeline and every card type, composer autocomplete, the skills, usage, routines, computer, bot settings and brains settings screens, approvals inbox, languages, PWA and the end-to-end paths
bump-version minor
replace-requirement ubiquitous 4: The web app shall provide screens for bot settings (identity, description, brain, policy, computer, spend cap), skills, routines, usage, settings (the brains on the hub's machine and the brain of each bot), the approvals inbox, and the computer view as a side panel and full screen.
append-requirement ubiquitous: The web app shall show the brain and model of the open bot next to its name.
append-requirement event: When the user presses Test on a brain or a bot in the settings screen, the web app shall call the brain test and show the reply and its duration, a warning when no model answered, or the error.
append-requirement event: When the user picks the `ollama` or `lmstudio` brain for a bot, the web app shall suggest the models that server has and say when it is not running.
append-criterion [verified] The settings screen shows installed and missing CLIs with install hints, local servers with their models (or off), and each bot's brain; it tests a brain or a bot and shows the answer, the echo warning or the error, and Configure opens the bot; the new-bot dialog offers Cursor, Ollama and LM Studio and suggests the Ollama models — verified by `packages/web/test/brains.test.tsx`.
append-criterion [verified] In a real browser, a user opens Settings, sees a local server's models, tests it and a bot on the Cursor CLI (both answer 391), sees the mock bot flagged as an echo, and opens a bot's brain settings from the list — verified by `tests/e2e/settings.test.ts`.
```
