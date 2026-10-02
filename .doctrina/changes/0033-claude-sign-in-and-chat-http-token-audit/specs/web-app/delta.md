# Spec Delta — capability: web-app

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/web-app/spec.md`

---

```ops
bump-version minor
append-requirement ubiquitous: The web app shall show in the Claude Code card of the brains screen whether Claude Code is signed in and offer signing in, with the page to open and a box for the code it shows, and when a test of that brain fails because its login expired the web app shall say so and point to the sign-in.
append-requirement ubiquitous: The web app shall show in a `chat-http` bot's settings whether a token is saved in the vault and when it expires, and the browser headers copied from a pasted cURL, which can be removed.
append-criterion [verified] After a Claude Code test fails with an expired login the card says so, signs in with the page and the code, clears the failure and tests well; a login that fails shows why — verified by `packages/web/test/claude-sign-in.test.tsx`.
append-criterion [verified] The settings show a token saved with its expiry, expired, or none; a pasted Authorization line is saved bare and shown as saved; Referer, User-Agent and Accept-Language are copied from a cURL without a cookie or another header, and can be removed — verified by `packages/web/test/chat-http.test.tsx`.
```
