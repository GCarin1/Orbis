# Spec Delta — capability: agent-runtimes

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/agent-runtimes/spec.md`

---

```ops
bump-version minor
append-requirement ubiquitous: The system shall give a `chat-http` bot the Bearer token its chat API's bots share (the API being the origin of the bot's address), else the bot's own token, and shall say, when there is none or it expired, to paste a new one in Settings → Brains → Chat API tokens, where it applies to every bot of that API.
append-criterion [verified] Two bots of one API use the token saved once for it and a bot of another API does not; changing it once changes it for both; a bot from before keeps its own token until its API has a shared one, which then wins; the shared token is masked in what a run stores; a missing or expired token points to Settings → Brains — verified by `packages/hub/test/runtimes/chat-http.test.ts`.
```
