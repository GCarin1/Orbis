# Spec Delta — capability: tool-gateway

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/tool-gateway/spec.md`

---

```ops
bump-version minor
append-requirement ubiquitous: The system shall forward each `tools/call` of the stdio MCP bridge as it arrives, without waiting for earlier calls, and wait for the hub's answer without a time limit.
append-requirement unwanted: The system shall not count a tool call the user denied toward the identical-call limit.
append-requirement event: When `http.fetch` cannot reach a server, the system shall name the network error (for example ECONNREFUSED) in the result.
append-criterion [verified] Through the bridge a slow call answers after a quick one sent later; a call denied twice is asked again and runs when allowed; `http.fetch` to a closed port names ECONNREFUSED — verified by `packages/hub/test/chat-audit.test.ts`.
```
