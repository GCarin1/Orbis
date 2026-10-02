# Spec Delta — capability: conversations

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/conversations/spec.md`

---

```ops
bump-version minor
append-requirement ubiquitous: The system shall write a run's steps to the database at most every 250 ms while it runs and once when it ends, and index the lookups every run makes (items, approvals and routine records by run; runs by conversation and by status).
append-requirement event: When the user tries a run again, the system shall keep the new run in the old run's chain.
append-criterion [verified] A run of 40 tool calls stores all its steps with fewer writes than a quarter of them; the database holds the run, conversation and status indexes; a retried run keeps its chain and its reply does not wake again a bot that already answered — verified by `packages/hub/test/audit-cycle5.test.ts`.
```
