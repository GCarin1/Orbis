# Spec Delta — capability: agent-runtimes

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/agent-runtimes/spec.md`

---

```ops
bump-version minor
append-requirement ubiquitous: The system shall provide the `chat-http` brain: a POST to the address the user gives (`baseUrl`) with the Bearer token of a bot secret (`apiKeySecret`, default `CHAT_BEARER_TOKEN`) and a `multipart/form-data` body whose `data` field holds the chat id, the agent, the message, and the model and request settings.
append-requirement ubiquitous: The system shall read a `chat-http` answer streamed as server-sent events, JSON lines, one JSON document or plain text, joining pieces or taking a growing answer whole, and skipping status, reference and user-echo events.
append-requirement event: When a `chat-http` answer carries a chat id, the system shall continue that chat in the run's next requests and in the conversation's next runs, sending only what is new, and start a new chat with the whole conversation when the stored one is refused.
append-requirement event: When a `chat-http` bot has tools, the system shall tell it to ask for one in a fenced `tool` block, run the tool through the gateway and send the result as the next message.
append-requirement unwanted: The system shall not call a `chat-http` API without an address, without a token, or with a JWT token past its expiry; it shall say which, and say that the token expired or is wrong when the server answers 401 or 403.
append-requirement unwanted: The system shall not write a `chat-http` address or token in its code, tests or documentation.
append-criterion [verified] Against a fake orchestrator, a bot posts a multipart `data` field with the Bearer token and Origin, reads a streamed answer and its usage, continues the returned chat with only the new message, uses a tool through a fenced `tool` block, resends the whole run when no chat id comes, starts a new chat when the stored one is refused, reports an expired JWT before calling and a 401 after; answers in SSE, JSON lines, one JSON document and plain text are read; a pasted cURL (bash or cmd) gives the address, token, agent, model and Origin — verified by `packages/hub/test/runtimes/chat-http.test.ts`.
```
