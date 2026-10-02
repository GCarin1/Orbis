# Spec Delta — capability: conversations

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/conversations/spec.md`

---

```ops
bump-version patch
append-requirement unwanted: The system shall not try again a routine's or a webhook's run outside its routine, which keeps the routine's rules (a test run is draft-only); it shall answer 409 `routine_run`.
append-criterion [verified] Trying again a failed routine test run answers 409 `routine_run` — verified by `packages/hub/test/review.test.ts`.
```
