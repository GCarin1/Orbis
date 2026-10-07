# Spec Delta — capability: web-app

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/web-app/spec.md`

---

<!-- delta body below -->
```ops
bump-version minor
append-requirement ubiquitous: The web app shall say on a connected MCP server's card which bots it tells about its updates, while any do, and above a message a bot wrote about an MCP update, that it did.
append-criterion [verified] A connected server's card says nothing of updates while no bot watches it and names the bots it tells once they do — verified by `packages/web/test/marketplace.test.tsx`
```
