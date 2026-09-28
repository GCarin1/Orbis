# Spec Delta — capability: cli

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/cli/spec.md`

---

```ops
bump-version minor
replace-requirement ubiquitous 2: The CLI shall provide the commands `serve`, `login`, `bots list|create|show|edit|delete|duplicate|export|import`, `chat`, `group create|list|chat|add|remove|delete`, `memory list|add|edit|rm`, `approvals list|allow|deny`, `skills list|add|show|remove`, `routines list|add|test|enable|disable|remove|runs`, `secrets list|set|rm`, `usage`, `runtimes check|test` and `mcp`.
append-requirement event: When `orbis runtimes test <kind>` or `orbis runtimes test @<handle>` runs, the CLI shall print the brain's reply to the test question and its duration, say when no model answered, and exit 1 when the test failed.
append-criterion [verified] `orbis runtimes check` lists the subscription CLIs and the local model servers, and `orbis runtimes test` prints a bot's test reply, flags the mock's echo and exits 1 on a failed test — verified by `packages/cli/test/runtimes.test.ts`.
```
