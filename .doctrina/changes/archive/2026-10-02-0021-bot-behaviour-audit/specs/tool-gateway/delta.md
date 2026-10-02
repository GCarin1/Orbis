# Spec Delta — capability: tool-gateway

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/tool-gateway/spec.md`

---

```ops
bump-version minor
append-requirement ubiquitous: The system shall return from `team.list_bots` each bot's handle without `@`, its name, role, busy flag and state.
append-requirement event: When a stdio MCP server stops, the system shall report the error line of its output, not the runtime's closing lines.
append-requirement unwanted: The system shall not run a tool call identical (same tool, same input) to two earlier calls of the same run, except the tools that read changing state (browser snapshot, screenshot, press and close, the team list, the skill and routine lists); it shall return an error result telling the bot to use the results it has.
append-criterion [verified] The third identical `memory.search` of a run is refused while a different one runs, and `team.list_bots` returns handles without `@` — verified by `packages/hub/test/bot-behaviour.test.ts`.
```
