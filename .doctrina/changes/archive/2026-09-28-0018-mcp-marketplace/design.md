# Design — Change 0018-mcp-marketplace

## Approach

The hub becomes an MCP client next to being an MCP server (ADR 0010).
`mcp/client.ts` speaks the protocol over two transports: a child process
with one JSON-RPC message per line, and streamable HTTP, where each message
is a POST answered with JSON or a server-sent event stream and the session
id travels back in `Mcp-Session-Id`. `mcp/oauth.ts` follows the MCP
authorization flow: the 401's `resource_metadata`, the authorization server
metadata, dynamic client registration with the hub's loopback redirect,
PKCE, the code traded on `/oauth/mcp/callback` (no API token: the one-time
state is the proof), and refresh.

`mcp/connections.ts` owns the connections: a row per server (migration 5),
its secrets in the hub secrets, its tools cached so bots keep seeing them
after a restart while the server itself starts on first use. Each remote
tool becomes a registry tool `mcp.<server>.<tool>` whose handler calls the
server; the gateway gives it the same treatment as Orbis's tools. Read-only
tools (the server's hint, or a catalog entry known to only read) run at
once; the others ask unless a rule allows them.

Allowlists gain `!` exclusions, and `*` stops at Orbis's own tools: an
external tool needs a pattern starting with `mcp.`. The same function lives
in `@orbis/shared`, so the bot settings' switches compute exactly what the
hub will allow.

## Alternatives considered

- The official SDK: heavier, and Orbis already implements the server side of
  the same messages.
- Pointing each CLI brain at the servers: would split configuration per
  brain and bypass the policy (ADR 0010).

## Trade-offs and risks

- Catalog entries can go stale (a package renamed, an endpoint moved); each
  was checked when added, and a failing one shows the server's error.
- Figma limits which apps may register, and GitHub, Vercel and Stripe offer
  no self-registration; those are left out or take a token.

## Decisions to record as ADRs

- ADR 0010 — External MCP servers are hub connections granted to bots one by one.
