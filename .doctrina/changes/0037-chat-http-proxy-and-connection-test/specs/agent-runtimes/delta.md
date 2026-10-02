# Spec Delta — capability: agent-runtimes

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/agent-runtimes/spec.md`

---

```ops
bump-version minor
append-requirement ubiquitous: The system shall send a `chat-http` brain's curl requests through the proxy the bot names, else the environment's (HTTPS_PROXY), else on Windows the proxy Windows uses for the chat's address (its Internet settings, a PAC script included), signing in to that proxy as the logged-in user; `direct` shall use none.
append-requirement event: When a connection test of a `chat-http` bot is asked for, the system shall try one GET of the chats' list (no message, no model call) by each way out of the computer — each curl it finds, through each proxy it knows and with none, and Node's fetch — and report for each whether it got through, was blocked by the firewall, had its token refused, or got no answer.
append-requirement unwanted: A template shall neither carry nor set a `chat-http` brain's curl program or proxy, and the system shall accept only a curl program whose file is named curl or curl.exe.
append-criterion [verified] A firewall that lets through only what comes from the company's proxy refuses a bot with no proxy (naming the way and pointing to the connection test) and passes one through it; the Windows proxy is used when the bot names none and the environment has none, read from PowerShell without the query and with quotes escaped; the connection test marks the proxied curl ok and the direct curl and Node blocked without posting a message; a template neither keeps nor plants a curl program or proxy, and a program not named curl is refused — verified by `packages/hub/test/runtimes/chat-http.test.ts`.
append-criterion [verified] curl is given the proxy with the logged-in user's sign-in and an empty no-proxy list, or no proxy at all for `direct`, or nothing for the environment's; Windows' curl and Git's are found beside the one on PATH, once each; the environment's proxy is read for the address's scheme — verified by `packages/hub/test/runtimes/http-transport.test.ts`.
```
