# Change 0007-skills-and-routines — skills-and-routines

- **Status:** applied
- **Applied:** 2026-09-27
- **Date:** 2026-09-27
- **Owner:** Claude Code
- **Lane:** product
- **Affects specs:** skills, routines, tool-gateway, approvals, cli, web-app

## Why

Skills and routines: SKILL.md skills at account and bot scope with /skill invocation, skills.list and skills.read tools and Claude Code materialization; routines with cron schedules in a timezone, signed webhooks, test runs in draft_only mode, enable after a successful test, last 20 runs, 50 per bot, absence pause, routine cards; CLI skills and routines commands; web /skill autocomplete and skills and routines screens

product.md delivery step 6 (first half) and success criterion SC6: bots
learn reusable procedures and work on their own schedule.

## What

- Skills: `SKILL.md` files (YAML frontmatter `name`, `description`,
  Markdown body) under `<data>/skills/` (account) and
  `<data>/bots/<id>/skills/` (bot); REST `GET|POST /skills`,
  `GET|PUT|DELETE /skills/:name?botId=`; the offered set (bot allowlist of
  account skills + own skills) listed in the bot's system context; tools
  `skills.list` and `skills.read`; `/<skill> input` messages run with the
  skill body; an unoffered invocation posts `skill.unavailable`; Claude
  Code runs get the offered skills in `.claude/skills/<name>/SKILL.md`.
- Routines: storage in the existing tables; cron triggers with an IANA
  timezone (croner) on a scheduler with an injectable clock; webhooks at
  `POST /hooks/routines/:id` verified with HMAC-SHA256 (`X-Orbis-Signature`
  or `X-Hub-Signature-256`) and the payload wrapped as untrusted content;
  test runs in `draft_only` mode (external tools become draft cards);
  enable only after a successful test unless `force`; last 20 runs; 50 per
  bot; absence pause after ORBIS_ABSENCE_PAUSE_DAYS without user activity;
  routine cards; tools `routine.create` (asks by default) and
  `routine.list`.
- CLI: `orbis skills list|add|show|remove`, `orbis routines
  list|add|test|enable|disable|remove|runs`.
- Web: `/` autocomplete of the offered skills, skills and routines screens,
  routine cards.
- Contract, docs, CHANGELOG.

## Scope boundaries

- Skill bundles with extra files (scripts, assets) are future; a skill is
  one SKILL.md.
- Secrets inside routines arrive with the secrets change.
- No routine triggers other than cron and webhook.

## Verification

- [x] Automated checks pass (`doctrina verify`).
- [x] skills criteria 1–4 and routines criteria 1–5 cite passing tests (`doctrina coverage`).
- [x] A routine cannot run from an unsigned webhook, and cannot be enabled without a successful test unless forced.

## Open questions

- None.
