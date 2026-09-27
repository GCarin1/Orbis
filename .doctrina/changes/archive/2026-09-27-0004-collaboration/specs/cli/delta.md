# Spec Delta — capability: cli

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/cli/spec.md`

---

```ops
set-header Implementation: planned — in progress: configuration, serve, bots, chat with inline approvals, group, memory, approvals, runtimes and mcp are verified; the skills, routines and usage command groups land with their capabilities
bump-version minor
replace-requirement ubiquitous 2: The CLI shall provide the commands `serve`, `login`, `bots list|create|show|edit|delete|duplicate|export|import`, `chat`, `group create|list|chat|add|remove|delete`, `memory list|add|edit|rm`, `approvals list|allow|deny`, `skills list|add|remove`, `routines list|add|test|enable|disable|remove`, `usage`, `runtimes check` and `mcp`.
append-requirement event: When `orbis group chat <group> "<message>"` runs, the CLI shall post the message to the group, print the steps and replies of every bot the message starts and of the runs those bots start by handoff or mention, and exit when all of them have ended.
append-criterion [verified] `orbis group create` then `orbis group chat` prints the reply of the mentioned member, and `orbis memory add --team` then `orbis memory list --team --json` prints the entry — verified by `packages/cli/test/collab.test.ts`.
```
