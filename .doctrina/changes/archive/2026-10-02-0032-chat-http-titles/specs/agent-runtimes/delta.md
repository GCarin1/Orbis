# Spec Delta — capability: agent-runtimes

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/agent-runtimes/spec.md`

---

```ops
bump-version minor
append-requirement event: When a `chat-http` run opens a new chat and the chats' history can be read, the system shall ask the chat API for that chat's title once, in the background, with a `POST` to `<history>/<chat id>/generate-title` carrying the message "Orbis · <bot name> — <task>", unless the bot's brain sets `chat.titles` to false.
append-requirement unwanted: The system shall not fail or slow a `chat-http` run because the title request failed or timed out.
append-criterion [verified] A bot that opens a chat asks for its title once (Bearer token, JSON body `{"data":{"userMessage":"Orbis · Ana — …"}}`) and not again when it continues the chat; with `titles: false` no title is asked; a title request answered with 500 leaves the run done — verified by `packages/hub/test/runtimes/chat-http.test.ts`.
```
