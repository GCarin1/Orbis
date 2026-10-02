# Spec Delta — capability: agent-runtimes

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/agent-runtimes/spec.md`

---

```ops
bump-version patch
append-requirement event: When a CLI brain resumes its session in a conversation, the system shall send it what was written there since its last run there started, except its own replies of that run.
append-requirement unwanted: The system shall not ask an API brain for its final answer more than once in a run, a retried request included.
append-criterion [verified] A resumed Claude Code session gets a colleague's message posted during its last run and not its own reply again; an LM Studio bot whose last request is retried after a 429 is asked once for its final answer — verified by `packages/hub/test/review.test.ts`.
```
