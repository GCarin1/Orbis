# Spec Delta — capability: hub-api

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/hub-api/spec.md`

---

```ops
bump-version minor
append-requirement unwanted: The system shall not fail with a server error when a `/v1/chat/completions` message starts no run (a `/skill` the bot is not offered); it shall answer 400 `no_run`.
append-criterion [verified] A completion asking for a skill the bot is not offered answers 400 with code `no_run` — verified by `packages/hub/test/audit-cycle4.test.ts`.
```
