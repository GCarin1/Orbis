# Spec Delta — capability: web-app

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/web-app/spec.md`

---

```ops
bump-version minor
append-requirement ubiquitous: The web app shall offer in a `chat-http` bot's settings a connection test that lists each way to the API with what the firewall said and lets the user use one that got through, and fields for the curl program and the proxy.
append-criterion [verified] The connection test lists each way (curl with its program and proxy, Node) with its verdict, offers Use this way only for one that got through, which fills the curl program and the proxy that the save keeps; with none through it says so — verified by `packages/web/test/chat-http.test.tsx`.
```
