# Spec Delta — capability: agent-runtimes

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/agent-runtimes/spec.md`

---

```ops
bump-version minor
append-requirement event: When a `chat-http` request ends and the chats' history can be read, the system shall take the reply that follows the sent message, and its tokens, from the chat's history, reading once more after 1.5 s when the reply is not saved yet, and use the streamed text only when the history has no reply.
append-requirement ubiquitous: The system shall take a `chat-http` chat's id from a chat-id key or from the id of a `chat` object in the answer, and count tokens spelled as `promptTokens` and `completionTokens`.
append-criterion [verified] With a history shaped like the owner's company chat (`data.chat.messages` with `role`, `content` and `usage`), a bot takes the reply and its 5760/194 tokens from the history whatever the stream held, prefers it to a stream read wrong, keeps the chat id given as `chat._id`, and reads neither the user's profile nor the follow-up questions as messages — verified by `packages/hub/test/runtimes/chat-http.test.ts`.
```
