# Spec Delta — capability: handoff

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/handoff/spec.md`

---

```ops
bump-version minor
append-requirement event: When the hub starts with handoff cards still `queued` or `running`, the system shall set them to `failed`, as their runs did not survive the restart.
append-criterion [verified] A handoff card left running by a stopped hub reads failed after the restart — verified by `packages/hub/test/chat-audit.test.ts`.
```
