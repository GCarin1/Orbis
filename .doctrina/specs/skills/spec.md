# Spec — skills

**Capability:** skills
**Status:** active
**Implementation:** planned — built by the skills-and-routines change (product.md delivery order 6)
**Realizes:** SC6
**Depends on:** tool-gateway, bots
**Last updated:** 2026-09-27
**Version:** 0.1.0

## Purpose

A skill is a reusable procedure written once and invoked with `/<name>`.
Skills follow the open SKILL.md layout so they travel between Orbis and other
agent tools. They live at account scope (every allowed bot sees them) or at a
single bot's scope.

## Requirements (EARS)

### Ubiquitous

- The system shall store each skill as a SKILL.md document with YAML frontmatter holding `name` and `description` and a Markdown body, at account scope or at one bot's scope.
- The system shall offer a bot the account skills in its skill allowlist (default: every account skill) plus the skills of its own scope.
- The system shall list the offered skills' names and descriptions in the bot's context and provide the tools `skills.list` and `skills.read`.

### Event-driven

- When a user message starts with `/<skill-name>`, the system shall start the run with that skill's body as instructions and the rest of the message as input.
- When a `claude-code` run starts, the system shall write the offered skills into the workspace directory `.claude/skills/<name>/SKILL.md` so the CLI's own skill loading finds them.
- When a user creates or edits a skill, the system shall reject a name outside `[a-z0-9-]{1,64}` or a document without a description.

### Unwanted-behavior (must-not)

- The system shall not run a `/<skill-name>` invocation for a skill the bot is not offered; it shall post an event naming the skill instead.

## Acceptance criteria

1. [unverified] Skills are created, listed, edited and deleted at account and bot scope, and a bad name or a missing description answers 400 — verified by `packages/hub/test/skills.test.ts`.
2. [unverified] A `/<skill-name> input` message starts a run whose brain input holds the skill body and the input — verified by `packages/hub/test/skills.test.ts`.
3. [unverified] A skill outside the bot's allowlist is not offered and its invocation posts an event — verified by `packages/hub/test/skills.test.ts`.
4. [unverified] A `claude-code` run finds the offered skills under `.claude/skills/` in its workspace — verified by `packages/hub/test/runtimes/claude-code.test.ts`.

## Maturity

**MVP (committed):**

- SKILL.md storage, scopes, allowlist, slash invocation, tools, materialization for Claude Code.

**Future (aspirational, not committed):**

- Teach a task: recording a browser session into a draft skill for review.
- Importing skills from a Git repository.

## Out of scope for this spec

- Sharing skills inside templates (see `specs/templates`).
