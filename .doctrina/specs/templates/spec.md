# Spec — templates

**Capability:** templates
**Status:** active
**Implementation:** verified — template export, secret scan and import (`packages/hub/src/templates/`)
**Realizes:** SC10
**Depends on:** bots, skills, routines
**Last updated:** 2026-09-27
**Version:** 0.3.1

## Purpose

A template is a shareable copy of a bot: its identity, description, brain
choice, policy, skills and routines, as one YAML file that can live in Git.
It never carries the bot's computer, logins, history, memory or secrets, and
export refuses to write a file that looks like it holds a credential.

## Requirements (EARS)

### Ubiquitous

- The system shall export a bot as one YAML document with `apiVersion: orbis/v1`, `kind: BotTemplate`, `metadata` (name, role, description, avatar color and shape) and `spec` (brain without credentials, policy, computer configuration, skills inline as SKILL.md text, routines).
- The system shall import a template as a new bot, creating its bot-scoped skills and its routines with the enabled flag off.

### Event-driven

- When a user exports a bot, the system shall scan the whole YAML document with the secret patterns (private key blocks, AWS access keys, GitHub tokens, Slack tokens, `sk-` style API keys and generic `password`/`token`/`secret` assignments with a literal value of 12 or more characters) and refuse the export, listing each finding's line, when any pattern matches.
- When a user imports a template whose `apiVersion` or `kind` differ from the supported ones, the system shall reject it naming the field.
- When an imported template holds an invalid skill, brain or routine, the system shall reject it naming the field and create nothing.

### Unwanted-behavior (must-not)

- The system shall not put computer state, browser profiles, conversation history, memory entries, secrets or API keys in a template.
- The system shall not enable an imported routine before it passes a test run.
- The system shall not report a `{{secret:NAME}}` placeholder as a credential finding, and shall not include the matched text in a finding.
- The system shall not export nor import access to the user's own machine: a `host` computer leaves a template, and enters a bot, as the hub's default computer.

## Acceptance criteria

1. [verified] Exporting then importing a bot yields a new bot with the same identity, description, brain choice, policy, skills and routines, with every routine disabled — verified by `packages/hub/test/templates.test.ts`.
2. [verified] A bot whose description contains a GitHub token is refused at export with the offending line — verified by `packages/hub/test/templates.test.ts`.
3. [verified] An exported document holds no memory, history, secret names or values, and no computer state — verified by `packages/hub/test/templates.test.ts`.
4. [verified] A template with another `apiVersion` or `kind` is rejected naming the field, and one with an invalid skill creates no bot — verified by `packages/hub/test/templates.test.ts`.
5. [verified] A bot on the user's own machine exports with no `host` access, and a template that names it imports a bot on the default computer — verified by `packages/hub/test/computer/host.test.ts`.

## Maturity

**MVP (committed):**

- YAML export and import, secret scan, disabled routines on import.

**Future (aspirational, not committed):**

- A public marketplace registry backed by Git with review before listing.
- Share links scoped to a team.

## Out of scope for this spec

- Third-party templates from other products, which are never imported.
