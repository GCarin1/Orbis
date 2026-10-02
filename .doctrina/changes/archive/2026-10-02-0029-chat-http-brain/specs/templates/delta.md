# Spec Delta — capability: templates

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/templates/spec.md`

---

```ops
bump-version patch
append-requirement unwanted: The system shall not put a `chat-http` brain's address in an exported template.
append-criterion [verified] A `chat-http` bot's exported template names its brain kind but neither its address nor its token — verified by `packages/hub/test/runtimes/chat-http.test.ts`.
```
