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


## Connecting other MCP servers (the MCP screen)

Orbis is also an MCP **client**: it connects to MCP servers of other
services and hands their tools to the bots you choose (ADR 0010). Open
**🧩 MCP** in the sidebar. The screen follows the MCP marketplaces of Claude,
Cursor and VS Code, and has two tabs:

- **Explore** — search, filter by how a server connects (no account,
  sign-in, free key) and by category, or start from the picks at the top.
  Each card shows the service's logo, where it runs (on this computer or on
  the web), what it does, how it connects and whether it only reads.
  - A click opens its **details**: how it connects, the program it starts or
    the address it calls, whether it only reads or asks before changing
    something, and who may use it.
  - The details hold the key fields, and the **Connect** button.
  - On a phone the details take the whole screen, and Back closes them.
- **Connected** — each server with its state, the faces of the bots that
  may use it, a switch per bot and its tools (which only read, which ask
  first). Reconnect and Disconnect are in its ⋮ menu.
- **Your own server** (top right, **+** on a phone) takes an address or a
  program to start.

- **The catalog**: 37 checked servers, all free to use. Each one needs no
  account, has a free plan, or takes a free key. Every entry was checked
  before it went in: its npm package exists and starts and lists its tools,
  or its address answers `initialize`. For a sign-in, the service also lets
  Orbis register itself. Each card says how it connects:
  - *No account*: **Connect** and it is ready.
    - Docs and code: DeepWiki (docs of any GitHub repository), Context7
      (library docs), Microsoft Learn, AWS Knowledge, Cloudflare Docs, GitMCP.
    - Research: Exa Search, Hugging Face, Jina AI Reader (an optional free
      key raises its limits), YouTube Transcript.
    - Finance: CoinGecko (crypto prices and markets).
    - On this computer: Sequential Thinking, Playwright Browser, Chrome
      DevTools, Filesystem (asks for the folder), Excel (reads and writes
      `.xlsx` files).
  - *Sign in*: **Connect with your account**, then **Sign in to …** opens
    the service's page, where you authorize Orbis.
    - Work: Notion, Linear, Jira & Confluence (Atlassian), Canva, Todoist,
      monday.com.
    - Development: Sentry, Supabase, Vercel, Cloudflare Workers, Neon
      Postgres, Prisma Postgres, Postman, Semgrep.
    - Finance: Stripe (its test mode is free).
    - Orbis registers itself with the service on the fly. It keeps the
      sign-in encrypted and refreshes it when it expires.
  - *Needs a key*: paste it. The card links to where you get it.
    - GitHub (personal access token), Brave Search, Tavily, Firecrawl,
      Airtable.
    - Alpha Vantage: stocks, ETFs, forex and crypto, fundamentals and
      technical indicators. Its free key goes in the address the hub calls
      (`?apikey=`). The hub adds it from the vault on each call, so the key
      never shows: not on the card, not in the API, not in an error.
  - Servers started with `npx` need Node.js on the machine that runs Orbis.
  - Left out, because they did not pass these checks: Asana (no
    self-registration for sign-in), and DuckDuckGo and Wikipedia (their
    packages are no longer maintained).
- **Your own server** takes one of two things:
  - an address: streamable HTTP, with an optional token (without one, Orbis
    tries signing in);
  - a program to start: a command, whose environment variables are kept
    encrypted.

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
