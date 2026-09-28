# Spec Delta — capability: cli

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/cli/spec.md`

---

```ops
bump-version minor
append-requirement ubiquitous: The CLI shall set a bot's manager with `--reports-to @handle` on `bots create` and `bots edit` (`none` clears it), and name the manager in `bots list` and `bots show`.
append-requirement event: When `orbis chat` follows a message, the CLI shall also stream the runs that handoffs, mentions and reports back start in that conversation, and exit when all of them have ended.
append-criterion [verified] `orbis bots create --reports-to @chief` and `orbis bots edit --reports-to none` set and clear the manager, `bots list` and `bots show` name it, and a reporting loop exits 1 naming it — verified by `packages/cli/test/bots.test.ts`.
append-criterion [verified] `orbis chat` after a handoff prints the receiver's answer and then the sender's report back before it exits — verified by `packages/cli/test/collab.test.ts`.
```
