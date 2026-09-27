# Change 0008-secrets-and-usage — secrets-and-usage

- **Status:** applied
- **Applied:** 2026-09-27
- **Date:** 2026-09-27
- **Owner:** Claude Code
- **Lane:** product (triage read "secrets" as a runtime signal; the secrets and usage requirements are unimplemented)
- **Affects specs:** secrets, usage, tool-gateway, cli, web-app

## Why

Secrets and usage: AES-256-GCM vault per bot with a master key, secret placeholders resolved only inside the tool gateway, redaction of values everywhere, secret.request cards; usage reports per bot and account, a price table overridable per installation, spend caps that refuse or stop runs, subscription cost left out of caps by default; CLI secrets and usage; web secret-request card and usage screen

product.md delivery step 6 (second half), success criteria SC8 (costs are
visible and capped) and SC9 (bots use credentials they never see); lands
ADR 0008.

## What

- `secrets/`: an AES-256-GCM vault per bot (key from ORBIS_MASTER_KEY or a
  generated `master.key`, mode 0600; the bot id and name bound as
  additional data), names `[A-Z][A-Z0-9_]{0,63}`, REST
  `GET /bots/:id/secrets`, `PUT|DELETE /bots/:id/secrets/:name`.
- Tool gateway: `{{secret:NAME}}` resolved only for tools that act
  (`computer.shell`, `computer.write_file`, `browser.open`, `browser.type`,
  `http.fetch`), against the calling bot's vault only; every value of the
  bot redacted to `••••` in tool results, run steps, replies, bot timeline
  items and approval inputs. API brains' `apiKeySecret` reads the vault.
- `secret.request`: a secret-request card with a masked form, the run
  waiting until `POST /cards/:itemId/secret` `{ value }` or
  `{ decline: true }`.
- Usage: `GET /usage?from=&to=&botId=` per bot and account (current UTC
  month by default), subscription cost reported apart, a price table
  overridable with `<data>/prices.json`, spend caps (refuse before start,
  stop after the step that crosses), subscription cost outside the cap
  unless `capIncludesSubscription`.
- CLI `orbis secrets list|set|rm` (value from a hidden prompt or stdin)
  and `orbis usage`; web secret-request card and usage screen.
- Contract, docs, CHANGELOG; land ADR 0008.

## Scope boundaries

- No shared (account-level) secrets and no secret rotation reminders.
- Placeholders in messages Orbis itself posts (drafts, conversation posts,
  memory) stay literal text: those tools never receive values.
- No billing integration; costs are estimates from token counts and the
  CLIs' own reports.

## Verification

- [x] Automated checks pass (`doctrina verify`).
- [x] secrets criteria 1–4 and usage criteria 1–3 cite passing tests (`doctrina coverage`).
- [x] No API response, timeline item or run step of the tests contains a stored secret value.

## Open questions

- None.
