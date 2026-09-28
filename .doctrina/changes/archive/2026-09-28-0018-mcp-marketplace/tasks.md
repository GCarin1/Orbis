# Tasks — Change 0018-mcp-marketplace

- [x] Write the hub's MCP client: stdio and streamable HTTP (JSON and server-sent events, session id), `initialize`, paged `tools/list`, `tools/call` flattened to text.
- [x] Sign in to remote servers: protected-resource and authorization-server discovery, dynamic client registration, PKCE, the `/oauth/mcp/callback` route, refresh.
- [x] Keep connected servers (migration 5) with their keys as hub secrets; register their tools as `mcp.<server>.<tool>`; reconnect on first use and after a restart; disconnect cleanly.
- [x] Make allowlists exclude with `!` and keep external tools out of `*` (shared `toolAllowed`); ask before a server's tools that are not read-only.
- [x] Curate the catalog (17 checked servers: no account, sign in, key) and serve it with the servers, bot access and `/api/v1/tools` routes.
- [x] Add the Tools screen (catalog, connected, custom server) and the tool switches in bot settings; keep servers live through the stream.
- [x] Record ADR 0010.
- [x] Cover it with hub, web and end-to-end tests; check the catalog against the live endpoints.
- [x] Update the docs (MCP guide, API), the contract and the CHANGELOG.
