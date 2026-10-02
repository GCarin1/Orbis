# Spec Delta — capability: agent-runtimes

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/agent-runtimes/spec.md`

---

```ops
bump-version minor
append-requirement event: When a `chat-http` answer holds no text Orbis can read, the system shall read the reply that follows the message it sent from the chat's history (`<history>/<chat id>`, the history being `history/chats` beside the request address unless the bot names another).
append-requirement event: When a `chat-http` answer names no chat, the system shall look among the newest chats of the history for the one holding the message it sent, and continue that chat.
append-requirement unwanted: The system shall not take as a bot's chat one that does not hold the message the bot sent, and shall not ask again in a run a history that failed.
append-criterion [verified] A reply missing from the answer is read from the chat's history; among the newest chats the one holding the sent message is continued and a browser chat beside it is not; a server without the history is asked once and the error shows how the answer began; history shapes of role lists, input/output pairs and user/answer fields are read; a history cURL gives its token and the history's address — verified by `packages/hub/test/runtimes/chat-http.test.ts`.
```
