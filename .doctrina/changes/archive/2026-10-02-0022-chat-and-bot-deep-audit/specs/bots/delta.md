# Spec Delta — capability: bots

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/bots/spec.md`

---

```ops
bump-version minor
append-requirement state: While a bot still has a run running or waiting in another conversation, the system shall keep it `working` or `waiting` when one of its runs ends.
append-requirement event: When the hub starts, the system shall mark the runs a previous process left running or waiting as failed and those left queued as cancelled.
append-criterion [verified] A bot whose short run ends while its long run goes on stays `working`, then becomes `done`; runs left waiting and their handoff cards are failed after a restart — verified by `packages/hub/test/chat-audit.test.ts`.
```
