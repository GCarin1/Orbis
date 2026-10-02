# Spec Delta — capability: web-app

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/web-app/spec.md`

---

```ops
bump-version minor
append-requirement ubiquitous: The web app shall let a `chat-http` bot's HTTP call be chosen in its advanced settings — automatic, curl or Node — and show how many browser headers a pasted cURL gave.
append-criterion [verified] The HTTP call is automatic by default and saves nothing; choosing Node saves `transport: fetch`; a pasted cURL gives its browser headers, counted and shown, and no cookie — verified by `packages/web/test/chat-http.test.tsx`.
```
