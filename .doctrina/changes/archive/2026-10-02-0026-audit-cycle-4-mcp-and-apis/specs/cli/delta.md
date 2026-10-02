# Spec Delta — capability: cli

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/cli/spec.md`

---

```ops
bump-version minor
append-requirement unwanted: The `orbis chat` and `orbis group chat` commands shall not follow runs of another message's chain in the same conversation.
append-criterion [verified] While `orbis chat` waits for its own run, a colleague's mention run in the same conversation is neither waited for nor printed — verified by `packages/cli/test/audit-cycle4.test.ts`.
```
