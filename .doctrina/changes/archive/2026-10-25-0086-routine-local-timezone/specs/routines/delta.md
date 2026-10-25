# Spec Delta — capability: routines

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/routines/spec.md`

---

```ops
bump-version minor
append-requirement event: When a routine is created without a timezone (by a bot's routine.create or through the API), the system shall give it the user's timezone, as last told by their device, else UTC.
append-criterion [verified] A device's timezone is kept and an unknown one refused; routines a bot or the API create without a timezone take it, and one given stays — verified by `packages/hub/test/user-zone.test.ts`
```
