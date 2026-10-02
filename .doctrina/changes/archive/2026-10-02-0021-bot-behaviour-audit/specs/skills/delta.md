# Spec Delta — capability: skills

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/skills/spec.md`

---

```ops
bump-version minor
append-requirement event: When a bot calls `skills.create` with a name, a description, instructions and optionally `when`, a colleague's handle and `replace`, the system shall save the skill as a bot-scope skill of that bot (the caller when no handle is given), after the user's approval by default.
append-requirement unwanted: The system shall not overwrite an existing skill of the bot through `skills.create` without `replace`.
append-criterion [verified] A bot creates a skill for @pesquisa with `skills.create`, the skill is offered to Pesquisa, and a second call with the same name is refused asking for `replace` — verified by `packages/hub/test/bot-behaviour.test.ts`.
```
