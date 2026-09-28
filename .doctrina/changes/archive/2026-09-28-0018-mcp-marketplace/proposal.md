# Change 0018-mcp-marketplace — MCP marketplace

- **Status:** applied
- **Applied:** 2026-09-28
- **Date:** 2026-09-28
- **Owner:** Claude Code
- **Lane:** product (confident; signals: feature)
- **Affects specs:** tool-gateway, web-app

## Why

The project owner wants to choose the tools and MCP servers each bot can
use, and a functional marketplace of MCP tools where they only click and
connect. Orbis served its own tools over MCP but used no one
else's, and a bot's tools were a comma-separated text field.

## What

- Hub: `mcp/client.ts`, `mcp/oauth.ts`, `mcp/catalog.ts` (17 servers),
  `mcp/connections.ts`, `mcp/routes.ts` (`/api/v1/mcp/catalog`,
  `/api/v1/mcp/servers…`, `/api/v1/tools`, `/oauth/mcp/callback`),
  migration 5, `mcp.updated` / `mcp.deleted` events; the registry's
  external tools, `unregister` and allowlist exclusions.
- Shared: MCP types, `toolAllowed` and `globToRegExp`.
- Web: `Marketplace.tsx` (the Tools screen), `ToolPicker.tsx` (bot
  settings), the store and the sidebar.
- ADR 0010.
- Tests: hub `mcp-servers` (with a fake stdio server and a fake OAuth HTTP
  server), web `marketplace`, e2e `marketplace`.
- Docs: `docs/mcp.md`, `docs/api.md`, READMEs, CHANGELOG, contract
  hub-surface.

## Scope boundaries

- MCP resources, prompts and sampling are not used; tools only.
- The old HTTP+SSE transport (two endpoints) is not supported; streamable
  HTTP and stdio are.
- No automatic installation of Node.js or Python; npx servers say they need
  Node.js.

## Verification

<!--
How you will know the change is correctly applied. Use checkboxes: every
box here is a claim that must be PROVEN before the change is done.
`doctrina change archive` refuses to archive while any box below is
unchecked (pass --force to archive anyway and record the gap). Distinguish
"task marked done" from "verification passed" — link the evidence.
-->

- [x] Automated checks pass (`doctrina verify`), including the new hub, web and end-to-end tests.
- [x] The affected specs' acceptance criteria cite their evidence (`doctrina coverage --strict`).
- [x] The client connected to the live DeepWiki, Exa, Context7 and Hugging Face endpoints and called a DeepWiki tool; sign-in discovery found registration on Notion, Linear, Atlassian, Sentry, Supabase and Canva. A full sign-in with a real account was not done here (it needs the owner's accounts).

## Open questions

- None.
