# Spec Delta — capability: agent-runtimes

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/agent-runtimes/spec.md`

---

```ops
bump-version minor
append-requirement ubiquitous: The system shall make every request of a `chat-http` brain — the message, the history and the title — through the system's `curl` program when it is installed, and through Node's `fetch` otherwise or when the bot's `chat.transport` is `fetch`, keeping the Authorization header in a private temporary file that is removed afterwards and never on curl's command line.
append-requirement ubiquitous: The system shall keep from a pasted cURL, for every request to the chat API, the browser headers `User-Agent`, `Accept-Language`, `Referer`, `Cache-Control`, `Pragma`, `Priority`, `sec-ch-ua`, `sec-ch-ua-mobile`, `sec-ch-ua-platform`, `sec-fetch-dest`, `sec-fetch-mode` and `sec-fetch-site`, and shall keep no cookie, no key and no Authorization header.
append-requirement event: When a `chat-http` stream ends with a complete message (`message_complete`), the system shall take the reply, the chat id and the token usage from it, leave out the follow-up-questions block, and not read the chat's history.
append-requirement event: When a firewall in front of a `chat-http` server refuses the request (HTTP 403 with a Cloudflare page), the system shall fail the run naming the firewall, the program the request went through and what was sent.
append-criterion [verified] The company chat's stream (a start, chunks with the follow-up block, a message_complete) gives the reply without the follow-up questions, the chat to continue and the 6096/153 tokens with no history read; a firewall that wants the browser's headers refuses a bot without them, naming Cloudflare and curl, and lets a bot with them through — client hints arrive as the browser wrote them — and Node's fetch does the same when asked; only the browser headers on the list are kept from a cURL — verified by `packages/hub/test/runtimes/chat-http.test.ts`.
append-criterion [verified] A fake curl is run with the token in a private header file that is gone afterwards and not in its arguments, the body on stdin, a JSON body or none; curl's own words come back when it cannot reach the server; a missing curl and a cancelled run end cleanly; the real curl and Node's fetch make the same request and read the same answer; curl is chosen when installed — verified by `packages/hub/test/runtimes/http-transport.test.ts`.
```
