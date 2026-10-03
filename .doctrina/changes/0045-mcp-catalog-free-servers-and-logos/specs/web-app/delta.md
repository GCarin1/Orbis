# Spec Delta — capability: web-app

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/web-app/spec.md`

---

```ops
bump-version minor
replace-requirement ubiquitous 16: The web app shall provide an MCP screen, named MCP in the sidebar: a catalog of MCP servers with search and categories (finance among them), each card showing its service's logo and saying whether it needs no account, a sign-in or a key, connecting in one click (a form for a key, with where to get it; a sign-in link for an account); the connected servers with their logo, state, tools, the bots that may use each one and Reconnect and Disconnect; and a form for a custom server.
append-requirement ubiquitous: The web app shall show each MCP server's logo on a white tile on its catalog card, its connected card and the bot's tool switches, and the server's emoji in its place when the server has no logo or the logo does not load.
append-criterion [verified] The catalog and a connected server show the service's logo; with no logo, or when the logo fails to load, the catalog and a bot's tool switches show the emoji on the same tile; the search box is "Search MCPs" — verified by `packages/web/test/marketplace.test.tsx`.
append-criterion [verified] In a real browser the sidebar names the screen MCP and the GitHub card's logo loads from `/logos/mcp/github.svg` — verified by `tests/e2e/marketplace.test.ts`.
```
