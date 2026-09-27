# Spec Delta — capability: agent-runtimes

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/agent-runtimes/spec.md`

---

```ops
set-header Implementation: verified
bump-version minor
set-criterion 2: verified
set-criterion 3: verified
set-criterion 5: verified
set-criterion 8: verified
append-requirement ubiquitous: The system shall use `claude-opus-5` for an `anthropic` brain that names no model, with adaptive thinking on the models that support it.
append-requirement event: When an `anthropic` brain runs `claude-opus-5`, `claude-opus-5-5` or `claude-fable-5-1` against the first-party API, the system shall request the server-side refusal fallback (`fallbacks: "default"`).
append-requirement unwanted: The system shall not execute tool calls from an API brain turn that stopped on `refusal`, or on `max_tokens` while holding a tool call; the run fails naming the reason.
```
