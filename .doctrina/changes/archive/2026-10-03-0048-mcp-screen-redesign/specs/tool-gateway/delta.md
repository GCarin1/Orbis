# Spec Delta — capability: tool-gateway

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/tool-gateway/spec.md`

---

```ops
bump-version patch
append-requirement event: When the web app asks for the MCP marketplace, the system shall say for each entry whether every tool of it only reads, so the user knows before connecting it.
append-criterion [verified] The marketplace says that DeepWiki only reads and says nothing of the kind for GitHub — verified by `packages/hub/test/mcp-servers.test.ts`.
```
