# Spec Delta — capability: cli

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/cli/spec.md`

---

```ops
set-header Implementation: planned — in progress: configuration, serve, bots, chat with inline approvals, group, memory, skills, routines, secrets, usage, approvals, runtimes and mcp are verified; bots export|import land with templates
bump-version minor
replace-requirement ubiquitous 2: The CLI shall provide the commands `serve`, `login`, `bots list|create|show|edit|delete|duplicate|export|import`, `chat`, `group create|list|chat|add|remove|delete`, `memory list|add|edit|rm`, `approvals list|allow|deny`, `skills list|add|show|remove`, `routines list|add|test|enable|disable|remove|runs`, `secrets list|set|rm`, `usage`, `runtimes check` and `mcp`.
append-requirement unwanted: The CLI shall not take a secret value as a command-line argument; `orbis secrets set` reads it from a hidden prompt or from stdin.
append-criterion [verified] `orbis secrets set` stores a value piped on stdin and `orbis secrets list` shows names only; `orbis usage` prints this month's runs, cost and cap per bot and the total — verified by `packages/cli/test/secrets-usage.test.ts`.
```
