# Spec Delta — capability: web-app

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/web-app/spec.md`

---

```ops
bump-version minor
append-requirement ubiquitous: The web app shall offer plain chat in a `chat-http` bot's settings, off by default and explained, and shall name the fields a refused save got wrong.
append-requirement event: When a connection test of a `chat-http` bot finds a way through, the web app shall say that the test sends no message, and that messages still blocked mean the firewall reads them.
append-criterion [verified] Plain chat is off by default, explained, and saved as `plain: true` when turned on; a refused save names its field — verified by `packages/web/test/chat-http.test.tsx`.
```
