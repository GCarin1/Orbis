# Spec Delta — capability: agent-runtimes

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/agent-runtimes/spec.md`

---

```ops
bump-version minor
append-requirement optional: Where an OpenAI-compatible bot's base address contains `{model}`, the system shall put the bot's model there and call that address followed by `/chat/completions`, and where the bot's `apiKeyHeader` is `api-key` the system shall send its key in an `api-key` header instead of `Authorization: Bearer`.
append-requirement event: When an OpenAI-compatible server answers one JSON document instead of a stream, the system shall read its text, tool calls, finish reason and usage as the stream's would be read, and when a server refuses the stream with a 4xx that names it, the system shall ask the same step again with `"stream": false`.
append-requirement unwanted: The system shall not repeat in a brain check, a run error or a log a value set where a key's secret name goes that is not a secret's name.
append-criterion [verified] A gateway with the model in its path and the key in an `api-key` header answers non-streamed JSON with a tool call and the run calls the tool and answers, with usage; the key is a Bearer token by default; a gateway that refuses the stream is asked again without it; a check of a bot whose secret name is a key says so without the key — verified by `packages/hub/test/runtimes/openai.test.ts`.
```
