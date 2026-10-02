# Spec Delta — capability: routines

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/routines/spec.md`

---

```ops
bump-version minor
append-requirement unwanted: The system shall not start a scheduled run of a routine while its previous scheduled run is queued, running or waiting; it shall post one `routine.skipped` event per such run instead.
append-requirement event: When the hub starts, the system shall record the outcome of each routine run whose run ended while the hub was down.
append-criterion [verified] A routine scheduled every minute whose run takes longer skips its next turns with a single `routine.skipped` event and fires again once the run ended; a routine run cut by a restart reads failed with the reason — verified by `packages/hub/test/audit-cycle1.test.ts`.
```
