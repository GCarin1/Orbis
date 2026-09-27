# MCP: how CLI brains (and your own agents) reach Orbis tools

The hub serves its tool registry over the Model Context Protocol:

- **HTTP**: `POST /mcp`, one JSON-RPC 2.0 message per request, protocol
  `2025-06-18` (also accepts `2025-03-26` and `2024-11-05`). Methods:
  `initialize`, `ping`, `tools/list`, `tools/call`; notifications answer 202.
  `GET /mcp` answers 405 (no server-sent stream).
- **stdio**: `orbis mcp` (or the hub's `dist/mcp-bridge.js`) reads JSON-RPC
  lines on stdin, forwards each to `/mcp` and prints the answers on stdout.

Both authenticate with a **run token** (`Authorization: Bearer <token>` /
`ORBIS_RUN_TOKEN`), not the API token. The hub creates one for each run, it
names exactly one bot and one run, and it is revoked when the run ends — so a
CLI brain can use its own bot's tools, under its own policy, for as long as it
works, and nothing more.

When a `claude-code` bot runs, Orbis passes:

```json
{ "mcpServers": { "orbis": { "type": "stdio", "command": "/usr/bin/node",
  "args": ["…/@orbis/hub/dist/mcp-bridge.js"],
  "env": { "ORBIS_URL": "http://127.0.0.1:7420", "ORBIS_RUN_TOKEN": "…" } } } }
```

with `--strict-mcp-config` (only Orbis's server) and
`--permission-prompt-tool mcp__orbis__approval_prompt`. Tool names travel with
underscores on the wire: Claude sees `mcp__orbis__team_list_bots`,
`mcp__orbis__draft_create`, and so on.
