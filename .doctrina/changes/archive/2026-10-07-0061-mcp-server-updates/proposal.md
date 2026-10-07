# Change 0061-mcp-server-updates — mcp-server-updates

- **Status:** applied
- **Applied:** 2026-10-07
- **Date:** 2026-10-07
- **Owner:** Orbis maintainers
- **Lane:** product
- **Affects specs:**

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

MCP server updates reach the bots that watch them: notifications, resource subscriptions, new tool lists and pings handled; watched servers kept connected and listened to; batches wake the bots as initiative

## What

- `packages/hub/src/mcp/client.ts`: notifications from a server go to a
  handler; its `ping` is answered; `HttpTransport.listen()` keeps the GET
  stream open; `onClose`; the server's capabilities; resources listed,
  subscribed and read.
- `packages/hub/src/mcp/connections.ts`: a server's watchers; watched
  servers kept connected, listened to and started again; updates gathered
  in batches and handed on; tool lists refreshed; `McpServer.watchers`.
- `packages/hub/src/initiative/service.ts`: a batch wakes each watching
  bot as a run of initiative `mcp`, held through quiet hours and work, at
  most 12 a day.
- Web: the server card names the bots it tells.
- Specs: tool-gateway, bots, web-app. Docs: `docs/mcp.md` (Updates from a
  server), `docs/initiative.md`, README, CHANGELOG, hub-surface contract.

## Scope boundaries

- Sampling, roots and elicitation requests from a server stay refused.
- Progress notifications are ignored.

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
