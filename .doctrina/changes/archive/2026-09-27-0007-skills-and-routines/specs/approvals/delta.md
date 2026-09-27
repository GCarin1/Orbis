# Spec Delta — capability: approvals

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/approvals/spec.md`

---

```ops
bump-version patch
append-criterion [verified] In a draft-only routine run (every routine test run), an `external` tool call becomes a draft card and does not run, and the bot is told so — verified by `packages/hub/test/routines.test.ts`.
```
