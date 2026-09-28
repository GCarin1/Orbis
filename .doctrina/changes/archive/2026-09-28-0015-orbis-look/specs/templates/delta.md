# Spec Delta — capability: templates

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/templates/spec.md`

---

```ops
bump-version minor
replace-requirement ubiquitous 1: The system shall export a bot as one YAML document with `apiVersion: orbis/v1`, `kind: BotTemplate`, `metadata` (name, role, description, avatar color and shape) and `spec` (brain without credentials, policy, computer configuration, skills inline as SKILL.md text, routines).
```
