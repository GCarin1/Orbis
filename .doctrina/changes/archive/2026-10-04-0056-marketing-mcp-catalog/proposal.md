# Change 0056-marketing-mcp-catalog — marketing-mcp-catalog

- **Status:** applied
- **Applied:** 2026-10-04
- **Date:** 2026-10-04
- **Owner:**
- **Lane:** product (uncertain)
- **Affects specs:** tool-gateway

<!--
Optional, and usually absent. The closing docs gate reads COMMAND and FLAG
names out of the prose below and asks for documentation when it finds any.
It cannot tell a change from a mention: explaining an effect, or writing a
Scope boundaries line about what this deliberately does NOT touch, names
things just as loudly as changing them would.

When that happens, say so on the record instead of forcing the close:

- **Documented surface:** n/a — names two commands to explain an effect; alters neither

`none` reads the same as `n/a`, and a BARE one silences nothing — the
reason is the declaration.
-->

## Why

MCP catalog for a marketing analyst: Meta Ads and TikTok Ads (official hosted servers, sign in with the business account), Google Analytics (Google's official server, read-only) and Instagram (organic metrics, posts and comments) under a new Marketing category

## What

The owner wants a marketing-analyst bot that reads their social networks. A new **Marketing** category in the
MCP catalog, every entry checked live on 2026-10-04 as the catalog requires:

- **Meta Ads** — `https://mcp.facebook.com/ads`, Meta's official hosted server. Answers `initialize` with a 401
  whose protected-resource metadata points to `https://www.facebook.com/ads`, which publishes PKCE, public
  clients and a registration endpoint: Orbis's one-click sign-in works as is.
- **TikTok Ads** — `https://business-api.tiktok.com/open_mcp/tt-ads-mcp-layer`, TikTok's official server, the
  progressive endpoint (~40 tools; the flat one puts ~400 in every bot's context). Its authorization server
  publishes metadata under its own path (`<issuer>/.well-known/openid-configuration`), which Orbis already tries,
  with a registration endpoint.
- **Google Analytics** — Google's official `analytics-mcp` (`pipx run analytics-mcp`), read-only by its scope:
  it starts and lists 9 tools. It takes a credentials file and a project id. Google's hosted endpoint
  (`analyticsdata.googleapis.com/mcp/v1`) is left out: accounts.google.com lets no app register itself.
- **Instagram** — `@mcpware/instagram-mcp@1.0.4` (community, MIT): its code calls only `graph.facebook.com`, has
  one dependency and no install scripts; it starts and lists 23 tools. Pinned to that version because its token
  can post and send DMs; none of its tools claims to only read, so each asks first.
- Logos from Simple Icons (CC0); the connect sheet's fields no longer widen it on a phone when a help text holds a
  long command.

LinkedIn is left out: it has no official server, and the popular one drives the user's logged-in session, which
LinkedIn's terms forbid.

## Scope boundaries

- No new sign-in mechanism: no "bring your own OAuth client", so Google's hosted Analytics endpoint stays out.
- The phone's install script does not add `pipx`; Google Analytics needs it on the machine that runs Orbis.
- No marketing-analyst template; the servers are granted to bots one by one as before (ADR 0010).

## Verification

<!--
How you will know the change is correctly applied. Use checkboxes: every
box here is a claim that must be PROVEN before the change is done.
`doctrina change archive` refuses to archive while any box below is
unchecked (pass --force to archive anyway and record the gap). Distinguish
"task marked done" from "verification passed" — link the evidence.
-->

- [x] Automated checks pass (`doctrina verify`, or the project's typecheck/test/build).
- [x] The affected spec's acceptance criteria are met and cite their evidence (`doctrina coverage`).

## Open questions

<!-- List unresolved decisions. Empty if none. -->
