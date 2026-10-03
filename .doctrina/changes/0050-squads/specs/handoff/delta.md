# Spec Delta — capability: handoff

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/handoff/spec.md`

---

```ops
bump-version minor
append-requirement event: When a bot hands off to a squad's handle (`@growth`) that no bot's handle or role matches, the system shall hand the task to that squad's representative.
append-criterion [verified] A handoff to `@growth` reaches Growth's representative — verified by `packages/hub/test/squads.test.ts`.
```
