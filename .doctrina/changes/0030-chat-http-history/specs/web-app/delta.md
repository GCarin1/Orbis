# Spec Delta — capability: web-app

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/web-app/spec.md`

---

```ops
bump-version patch
append-requirement event: When a pasted cURL only reads (no body), the web app shall keep the request address, take its token and, for a history request, the history's address, and say so.
append-criterion [verified] Pasting a history GET cURL keeps the request address, saves its token and the history's address — verified by `packages/web/test/chat-http.test.tsx`.
```
