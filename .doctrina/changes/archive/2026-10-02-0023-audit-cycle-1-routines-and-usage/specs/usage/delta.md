# Spec Delta — capability: usage

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/usage/spec.md`

---

```ops
bump-version minor
append-requirement unwanted: The system shall not add up a brain's cumulative token totals as if each were new usage; it shall count what each report adds.
append-criterion [verified] Two cumulative Codex token reports of 100 then 250 input tokens count 100 and 150 — verified by `packages/hub/test/audit-cycle1.test.ts`.
```
