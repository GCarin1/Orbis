# Spec Delta — capability: tool-gateway

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/tool-gateway/spec.md`

---

<!-- delta body below -->
```ops
bump-version minor
append-requirement ubiquitous: The system shall keep connected every MCP server that a bot watches (a bot with its tools, initiative on and its MCP updates on): a program kept running and started again 15 seconds, then 1, 5 and 15 minutes after it stops; an HTTP server's GET stream kept open with its session and opened again when it ends; and subscribe to a watched server's resources (its first 100) when it allows it.
append-requirement event: When a connected MCP server sends `notifications/tools/list_changed`, the system shall list its tools again and offer the new list to the bots.
append-requirement event: When a watched MCP server sends `notifications/message` with a level other than `debug`, or `notifications/resources/updated` (the resource read again, up to 2,000 characters), the system shall gather its updates for 30 seconds, at most 20, and hand them with the server's watchers to the bots' initiative.
append-requirement event: When an MCP server sends a `ping` request, the system shall answer it; any other request from a server is refused as not offered.
append-criterion [verified] A watched program's warning and changed resource (read again) reach its bot as untrusted data in a run of initiative whose message is posted, its debug line does not, its ping is answered and its new tool is offered; a server no bot watches is not listened to, and stops being watched when its bot turns updates off; a watched program that stops is started again; an HTTP server's GET stream is opened with its session, its ping answered and its error message reaches the bot — verified by `packages/hub/test/mcp-updates.test.ts`
```
