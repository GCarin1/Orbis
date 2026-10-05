# Change 0058-instagram-adelaidasofia — instagram-adelaidasofia

- **Status:** applied
- **Applied:** 2026-10-05
- **Date:** 2026-10-05
- **Owner:** Orbis maintainers
- **Lane:** product
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

Instagram in the MCP catalog: replace the mcpware server with adelaidasofia/instagram-mcp (official Graph API, PyPI 0.1.2, read through), its read tools marked read-only by the catalog, an old connection told to reconnect, and pipx on the phone

## What

- `packages/hub/src/mcp/catalog.ts`: the Instagram entry runs
  adelaidasofia/instagram-mcp from PyPI with `pipx`, pinned to 0.1.2 (the
  same code as GitHub's, read before it was listed). Fields: the access
  token (secret), the Instagram Business Account ID, the optional app secret
  (secret, signs each call). It names its 15 read tools in `readOnlyTools`.
- `packages/shared/src/types.ts`: `McpCatalogEntry.readOnlyTools?`.
- `packages/hub/src/mcp/connections.ts`: a tool an entry names as a read is
  read-only; a connection whose entry now starts another program is an
  error that says to disconnect and connect again, at start and on attach.
- `scripts/android/orbis-termux.sh`: the phone's Debian installs `python3`
  and `pipx`.
- Specs: tool-gateway (the Instagram server, catalog-named reads, outdated
  connections). Docs: `docs/mcp.md`, `CHANGELOG.md`, the hub-surface contract.

## Scope boundaries

- The server's own multi-account tools stay as they are; Orbis passes one
  account through the environment.
- DMs stay off: they need Meta's App Review, which the user does in Meta.

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
