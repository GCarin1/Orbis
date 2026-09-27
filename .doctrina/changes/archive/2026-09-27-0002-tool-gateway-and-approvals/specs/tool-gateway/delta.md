# Spec Delta — capability: tool-gateway

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/tool-gateway/spec.md`

---

```ops
set-header Implementation: planned — in progress: registry, allowlist, MCP over HTTP and stdio, untrusted envelopes and the result cap are verified since change 0002; the tools of handoff, memory, computer, browser, skills, routines and secrets register with their changes
bump-version minor
set-criterion 1: verified
set-criterion 2: verified
set-criterion 3: verified
set-criterion 4: verified
set-criterion 5: verified
append-requirement unwanted: The system shall not send a request body or use a method other than GET or HEAD through `http.fetch`, so that data leaves Orbis only through a draft the user sends.
append-requirement event: When an MCP client sends a GET request to `/mcp`, the system shall answer 405 because the endpoint offers no server-sent stream.
```
