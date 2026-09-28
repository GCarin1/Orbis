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


## Connecting other MCP servers (the Tools screen)

Orbis is also an MCP **client**: it connects to MCP servers of other
services and hands their tools to the bots you choose (ADR 0010). Open
**🧩 Tools** in the sidebar:

- **Catalog** — checked servers, each saying how it connects:
  - *No account* — **Connect** and it is ready: DeepWiki (docs of any GitHub
    repository), Exa Search, Context7 (library docs), Hugging Face, Sequential
    Thinking, Playwright Browser, Filesystem (asks for the folder).
  - *Sign in* — **Connect with your account**, then **Sign in to …** opens the
    service's page where you authorize Orbis: Notion, Linear, Jira &
    Confluence (Atlassian), Sentry, Supabase, Canva. Orbis registers itself
    with the service on the fly and keeps the sign-in encrypted; it refreshes
    it when it expires.
  - *Needs a key* — paste it (the card links to where you get it): GitHub
    (personal access token), Brave Search, Tavily, Firecrawl.
  - Servers started with `npx` need Node.js on the machine that runs Orbis.
- **Connected** — each server's state, its tools (which only read and which
  ask first), **the bots that may use it** (tick them), Reconnect and
  Disconnect. **Add your own MCP server** takes an address (streamable HTTP,
  with an optional token; without one Orbis tries signing in) or a program to
  start (a command, with environment variables kept encrypted).

A server's tools are named `mcp.<server>.<tool>` and go through the gateway
like Orbis's own: the bot's policy, approvals (tools that are not read-only
ask before running unless a rule allows them, for example
`mcp.github.* → allow`), the untrusted-content envelope and the result cap.
Every brain reaches them — API brains directly, CLI brains through this same
MCP endpoint — and keys never reach a brain or its config files.

### Choosing each bot's tools

In **⚙ Bot settings → Tools**, switches turn Orbis's tool groups (computer,
browser, web, memory, team…) and each connected server on or off. They write
the bot's allowlist, still editable by hand:

| Pattern | Means |
|---------|-------|
| `*` | every Orbis tool (never an external server's) |
| `computer.*` | a group |
| `!browser.*` | except this group |
| `mcp.notion.*` | every tool of the connected server `notion` |
| `!mcp.github.delete_file` | except this one tool |
| `!*` | nothing |

The API is in [`api.md`](api.md#mcp-servers).
