# Spec Delta — capability: approvals

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/approvals/spec.md`

---

```ops
bump-version minor
append-requirement state: While a run has more than one request to the user open, the system shall keep it `waiting` until the last one is answered.
append-criterion [verified] A run with two open approvals stays waiting after the first answer and runs again after the second — verified by `packages/hub/test/chat-audit.test.ts`.
```
