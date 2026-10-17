# Spec Delta — capability: handoff

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/handoff/spec.md`

---

```ops
bump-version minor
append-requirement event: When a handed-off bot hands parts of its task on and waits for them, the system shall end its handoff with its report once those parts are back, and give that report to the sender as its answer; a report that cannot start (the chain's depth) ends it with what the bot said.
append-criterion [verified] A representative that splits a manager's task with its squad answers the manager with its report, after its squad's parts — verified by `packages/hub/test/squad-delegation.test.ts`
```
