# Spec Delta — capability: routines

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/routines/spec.md`

---

```ops
set-header Implementation: verified — routines service, scheduler and webhooks (`packages/hub/src/routines/`)
bump-version minor
append-requirement event: When the user enables a routine, the system shall clear its absence pause and compute its next fire time from the current time.
append-requirement unwanted: The system shall not catch up on fire times that passed while the hub was stopped.
set-criterion 1: verified
set-criterion 2: verified
set-criterion 3: verified
set-criterion 4: verified
set-criterion 5: verified
```
