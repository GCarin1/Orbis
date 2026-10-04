# Spec Delta — capability: tool-gateway

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/tool-gateway/spec.md`

---

<!-- delta body below -->
```ops
bump-version minor
set-header Implementation: verified — the registry, the allowlist with `!` exclusions, MCP over HTTP and stdio, untrusted envelopes, the result cap, and the MCP client with the marketplace (`packages/hub/src/mcp/`: stdio and streamable HTTP, OAuth sign-in — for a remote server, or for a program with the user's own client — keys as hub secrets, 43 free servers with their logos)
append-requirement event: When the user connects a marketplace program that cannot sign in by itself (an entry with `oauth`), the system shall have the user sign in through Orbis with the user's own OAuth client (its ID and secret kept as hub secrets) before starting the program, keep the tokens encrypted, start the program with them in the environment variables the entry names, and refresh them before handing them over when they expire.
append-requirement ubiquitous: The system shall send the OAuth `resource` parameter only for a server that names its resource, and add an entry's own sign-in parameters (such as Google's `access_type=offline`).
append-requirement ubiquitous: The system shall mark a marketplace server that signs in by itself with a code the user types on the service's page (OneDrive) as "Sign in with a code", listed with the servers that sign in.
append-requirement unwanted: The system shall not start a program that Orbis signs in for before the user signed in, nor sign in for it without the user's own OAuth client.
append-criterion [verified] Google Drive signs in through Orbis with the user's client (Drive read and the files it creates, offline access) and hands the tokens to the program's environment; OneDrive is Microsoft 365's server with its OneDrive tools, signed in with a code; with a stand-in program and provider, the program waits for the sign-in, gets the token refreshed before it starts, the exchange carries the client secret and no resource, and disconnecting forgets the client and the sign-in — verified by `packages/hub/test/mcp-files.test.ts`
append-criterion [verified] A server that signs in with a code says so on its card and its details, and the Sign-in filter lists it — verified by `packages/web/test/marketplace.test.tsx`
```
