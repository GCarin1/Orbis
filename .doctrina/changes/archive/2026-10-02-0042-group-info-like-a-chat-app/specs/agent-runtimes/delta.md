# Spec Delta — capability: agent-runtimes

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/agent-runtimes/spec.md`

---

```ops
bump-version patch
replace-requirement optional 4: Where an OpenAI-compatible bot's base address contains `{model}`, the system may put the bot's model there and call that address followed by `/chat/completions`, and where the bot's `apiKeyHeader` is `api-key` the system may send its key in an `api-key` header instead of `Authorization: Bearer`.
```
