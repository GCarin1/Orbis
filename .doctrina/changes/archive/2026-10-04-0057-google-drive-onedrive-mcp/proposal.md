# Change 0057-google-drive-onedrive-mcp — google-drive-onedrive-mcp

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

MCP catalog: Google Drive (signed in through Orbis with the user's own Google OAuth client; the tokens reach the program as environment variables) and OneDrive (Microsoft 365 server's OneDrive preset, signed in with a device code)

## What

The owner asked for Google Drive and OneDrive. What the checks found (2026-10-04) decided the shape:

- **Google Drive.** Google's own server (`drivemcp.googleapis.com/mcp/v1`) answers `initialize` and lists 8 tools,
  but is a Workspace Developer Preview, needs a pre-registered OAuth client (accounts.google.com has no dynamic
  registration) and asks for sign-in only on tool calls, so Orbis would never prompt. The community
  `@piotr-agier/google-drive-mcp@2.12.0` (MIT, calls only Google APIs) works with personal accounts, but its own
  sign-in blocks waiting for a browser on the hub and prints the link only to its log. It also takes an access
  and refresh token in its environment: with a fake token it answers at once with Google's `invalid_client`.
  So **Orbis signs in for the program**: a catalog entry may carry `oauth` (endpoints, scope, extra parameters,
  the environment variables) and `client_id`/`client_secret` fields for the user's own client; the hub signs in
  before starting the program and passes the tokens, refreshed when they expire. Scope: Drive read-only plus the
  files it creates (what Google's own server asks for), `access_type=offline` for a refresh token.
- **OneDrive.** Microsoft's own OneDrive server is Microsoft 365 business-only (Agent 365, preview). The
  community `@softeria/ms-365-mcp-server@0.158.0 --preset onedrive` (MIT, calls only Microsoft Graph and login)
  works with personal accounts: 28 tools, and its `login` tool gives the bot a code for
  `login.microsoft.com/device`. A new auth kind `device` says so ("Sign in with a code").
- `resource` is sent only when there is one (a provider's plain OAuth has none).
- Logos: Google Drive from Simple Icons; OneDrive from Wikimedia Commons, as Excel's.

## Scope boundaries

- No Gmail, Calendar, Docs or Sheets entries of their own (the Drive server reads Docs, Sheets and Slides).
- No "your own client" for remote servers (Google's hosted MCP servers): only programs Orbis starts.
- A Google consent screen left in Testing ends the sign-in after 7 days; the docs say so, Orbis cannot change it.

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
