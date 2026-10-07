# Spec Delta — capability: tool-gateway

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/tool-gateway/spec.md`

---

<!-- delta body below -->
```ops
bump-version minor
append-requirement ubiquitous: The system shall give a tool marked as given only by name (the health data's, `health.`) to a bot only when its allowlist names it by a pattern that starts with that prefix, as an MCP server's tools need `mcp.`, and say so in the tool list.
append-criterion [verified] `*` gives neither health tool, `health.*` gives both, and the tool list marks them as given only by `health.` — verified by `packages/hub/test/health.test.ts`
```
