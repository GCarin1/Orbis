# Tasks — Change 0007-skills-and-routines

- [x] Skill store (SKILL.md parse and validate, account and bot scope) and REST routes.
- [x] Offered skills in the context, `skills.list` / `skills.read`, `/<skill>` invocation and the unavailable event.
- [x] Claude Code runs get `.claude/skills/<name>/SKILL.md` in the workspace.
- [x] Routine store, REST routes, 50 per bot, last 20 runs, routine cards.
- [x] Scheduler (croner, timezone, injectable clock), webhooks with HMAC, test runs in draft_only, enable after a test, absence pause.
- [x] Tools `routine.create` (ask) and `routine.list`; draft_only holds external tools as drafts.
- [x] Tests: skills, routines, claude-code materialization.
- [x] CLI `skills` and `routines`; web `/` autocomplete, skills and routines screens, routine cards.
- [x] Contract, docs, CHANGELOG.
