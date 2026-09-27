# Spec Delta — capability: cli

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/cli/spec.md`

---

```ops
set-header Implementation: planned — in progress: configuration, serve, bots, chat with inline approvals, group, memory, skills, routines, approvals, runtimes and mcp are verified; usage and bots export|import land with their capabilities
bump-version minor
replace-requirement ubiquitous 2: The CLI shall provide the commands `serve`, `login`, `bots list|create|show|edit|delete|duplicate|export|import`, `chat`, `group create|list|chat|add|remove|delete`, `memory list|add|edit|rm`, `approvals list|allow|deny`, `skills list|add|show|remove`, `routines list|add|test|enable|disable|remove|runs`, `usage`, `runtimes check` and `mcp`.
append-requirement event: When `orbis routines test <id>` runs, the CLI shall wait for the draft-only test run to end, print its status and reply, and exit 1 when it failed.
append-criterion [verified] `orbis skills add|list|show|remove` manage account and bot skills and a `/skill` chat runs with the skill; `orbis routines add|test|enable|runs|remove` drive a routine from creation to enabled — verified by `packages/cli/test/skills-routines.test.ts`.
```
