# Spec Delta — capability: skills

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/skills/spec.md`

---

```ops
set-header Implementation: verified — SKILL.md store and routes (`packages/hub/src/skills/`), `/skill` invocation in message routing, the offered list in every run's context, Claude Code materialization
bump-version minor
append-requirement event: When a message starts with `/<word>` (after any mentions) and no skill of that name exists at any scope, the system shall treat the message as plain text, so the slash commands of agent CLIs pass through.
append-requirement event: When a Claude Code run starts, the system shall remove from `.claude/skills/` the skills it wrote earlier that the bot is no longer offered, and leave every other folder there untouched.
set-criterion 1: verified
set-criterion 2: verified
set-criterion 3: verified
set-criterion 4: verified
```
