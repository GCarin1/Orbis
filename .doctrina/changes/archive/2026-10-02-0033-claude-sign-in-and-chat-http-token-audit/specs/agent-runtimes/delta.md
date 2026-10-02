# Spec Delta — capability: agent-runtimes

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/agent-runtimes/spec.md`

---

```ops
bump-version minor
append-requirement event: When a run or a brain test of `claude-code` fails because Claude Code reports its login gone or expired, the system shall add to the error how to sign in again, in Orbis or with `claude auth login`.
append-requirement ubiquitous: The system shall report Claude Code's account (`claude auth status`), start its sign-in (`claude auth login`) from the settings screen and type the code the sign-in page shows to the waiting command, one sign-in at a time, and shall keep no credential itself.
append-requirement ubiquitous: The system shall take a `chat-http` token from whatever way it was pasted (bare, after "Bearer", a whole Authorization line, quoted or wrapped over lines), send only the token, and report whether a bot's token is saved and when it expires, never its value.
append-requirement event: When a `chat-http` server answers 401 or 403, the system shall fail the run telling the token (401, or an expired token) from a valid token the server still refuses, with what the server answered, what Orbis sent and what the browser sends that Orbis did not.
append-requirement ubiquitous: The system shall send a `chat-http` bot's `Origin` and kept browser headers (`Referer`, `User-Agent`, `Accept-Language`) with every request to the chat API — the message, the history and the title — and no header shall replace the token.
append-requirement unwanted: A template export shall not carry a `chat-http` brain's request address, `Origin`, history address or browser headers.
append-criterion [verified] A token pasted as a whole Authorization line, in quotes or wrapped is sent bare and read back by the history; the hub says a token is saved with its expiry and never the token; a 403 with a valid token says what the server answered and what was not sent, an expired token and a 401 say it is the token, the browser headers kept reach the message, the history and the title, and a template leaves out every address — verified by `packages/hub/test/runtimes/chat-http.test.ts`.
append-criterion [verified] A fake Claude Code reports its account, signs in through the page it prints and the code typed to it, fails with its own words on a wrong code, can be cancelled, is reported missing when absent, and an expired-login failure carries how to sign in again — verified by `packages/hub/test/runtimes/claude-account.test.ts`.
```
