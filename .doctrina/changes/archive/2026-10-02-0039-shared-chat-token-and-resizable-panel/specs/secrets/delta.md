# Spec Delta — capability: secrets

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/secrets/spec.md`

---

```ops
bump-version minor
append-requirement ubiquitous: The system shall keep one Bearer token per chat API, encrypted with the hub's secrets, list each chat API that `chat-http` bots use with its token's status and its bots, and replace an API's token on request; it shall never return the token itself.
append-requirement unwanted: The system shall not keep a value with no token, nor a token for an address that is not http(s), and shall not leave a shared token unmasked in what a run stores or shows.
append-criterion [verified] Saving a token for an API returns each API with its bots and token status and never the token; a value with no token or a non-http address is refused; the token is masked in a run's stored reply — verified by `packages/hub/test/runtimes/chat-http.test.ts`.
```
