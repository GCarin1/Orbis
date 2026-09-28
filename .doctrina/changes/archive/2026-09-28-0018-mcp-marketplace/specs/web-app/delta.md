# Spec Delta — capability: web-app

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/web-app/spec.md`

---

```ops
bump-version minor
append-requirement ubiquitous: The web app shall provide a Tools screen: a catalog of MCP servers with search and categories, each card saying whether it needs no account, a sign-in or a key, connecting in one click (a form for a key, with where to get it; a sign-in link for an account); the connected servers with their state, tools, the bots that may use each one and Reconnect and Disconnect; and a form for a custom server.
append-requirement ubiquitous: The web app shall let the user choose each bot's tools in its settings with switches for Orbis's tool groups and for each connected server, written to the bot's allowlist.
append-criterion [verified] The catalog shows how each server connects, searches and filters by category, connects one with no account in one click, asks for a key with where to get it, shows the sign-in link of a server that needs an account, gives a server to the bots ticked, and the bot's tool switches write `!group.*`, `mcp.<server>.*` and `!*` for nothing — verified by `packages/web/test/marketplace.test.tsx`.
append-criterion [verified] In a real browser, the user browses the catalog, adds their own MCP server, gives it to one bot, sees it among that bot's tools, and the bot's call reaches the server with its key and argument — verified by `tests/e2e/marketplace.test.ts`.
```
