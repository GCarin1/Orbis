# Spec Delta — capability: secrets

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/secrets/spec.md`

---

```ops
set-header Implementation: verified — AES-256-GCM vault and gateway resolution (`packages/hub/src/secrets/`), redaction in the engine, the timeline and approvals
bump-version minor
append-requirement ubiquitous: The system shall authenticate each encrypted value together with its bot id and name, so a value copied to another bot or name does not decrypt.
append-requirement unwanted: The system shall not resolve a placeholder in the input of a tool that only posts inside Orbis (drafts, conversation posts, memory, handoffs); only `computer.shell`, `computer.write_file`, `browser.open`, `browser.type` and `http.fetch` receive values.
set-criterion 1: verified
set-criterion 2: verified
set-criterion 3: verified
set-criterion 4: verified
```
