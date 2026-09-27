# Change 0009-templates-and-settings — templates-and-settings

- **Status:** applied
- **Applied:** 2026-09-27
- **Date:** 2026-09-27
- **Owner:** Claude Code
- **Lane:** product
- **Affects specs:** templates, cli, web-app

## Why

Templates and bot settings: export a bot as a BotTemplate YAML document with its skills and routines but no memory, history, computer state or secrets, refuse an export that looks like it holds a credential, import a template as a new bot with its routines disabled; CLI bots export and import; web bot settings screen with identity, description, brain, policy, computer, tools, spend cap, export, import, duplicate and delete

product.md delivery step 6 (last part) and success criterion SC10 (a bot
can be shared as a file); plus the bot settings screen the web-app spec
lists.

## What

- `templates/`: export a bot as a `BotTemplate` YAML document
  (`apiVersion: orbis/v1`): identity, description, avatar color, brain
  without credentials or secret names, policy, computer configuration,
  tool and skill allowlists, spend cap, its own skills as SKILL.md text and
  its routines; a secret scan (private keys, AWS keys, GitHub, Slack and
  `sk-` tokens, literal password/token/secret assignments of 12+
  characters) refuses the export with each finding's line; import creates a
  new bot, its skills and its routines disabled, and rejects a wrong
  `apiVersion` or `kind` naming the field.
- REST `GET /bots/:id/export` (text/yaml), `POST /bots/import` `{ yaml }`.
- CLI `orbis bots export @bot` (to stdout or `--out`) and
  `orbis bots import <file|->`.
- Web: a bot settings panel (identity, description, brain, policy rules,
  computer, tool and skill allowlists, spend cap) with Save, Export,
  Duplicate and Delete; template import in the new-bot dialog.
- Contract, docs, CHANGELOG.

## Scope boundaries

- No template gallery or registry; templates are files.
- Account-level skills are not exported (only the bot's own).

## Verification

- [x] Automated checks pass (`doctrina verify`).
- [x] templates criteria 1–3 cite passing tests (`doctrina coverage`).
- [x] A document with a credential is never written; an imported routine starts disabled.

## Open questions

- None.
