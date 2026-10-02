# Spec Delta — capability: tool-gateway

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/tool-gateway/spec.md`

---

```ops
bump-version minor
append-requirement ubiquitous: The system shall give every tool a wire name of at most 52 characters of `[A-Za-z0-9_-]` — a longer name keeps its start and gets a short hash of the whole name — and resolve a call by that name.
append-requirement event: When an HTTP MCP server answers 404 because it ended the session, the system shall connect again and repeat the call once.
append-requirement event: When a run is stopped while an external MCP tool call is in progress, the system shall stop waiting for the server's answer.
append-criterion [verified] A tool named after a long server and a long remote name gets a wire name of at most 52 characters that resolves back; it runs, and runs again after the server ended its session, with one new `initialize` — verified by `packages/hub/test/audit-cycle4.test.ts`.
```
