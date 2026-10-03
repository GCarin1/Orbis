# Spec Delta — capability: tool-gateway

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/tool-gateway/spec.md`

<!--
For ADDED: include the full new spec body below. On apply, the body is
written verbatim to the target path.

For MODIFIED: prefer a fenced `ops` block — on apply the CLI executes it
against the target spec, all ops or none (ADR 0007). The verbs cover
headers, acceptance criteria, AND the EARS requirement bullets, so a
typical delta applies mechanically end to end; only free-prose rewrites
(Purpose, Maturity, ...) stay a by-hand merge. A MODIFIED delta with no
`ops` block prints a manual-merge pointer.

  ```ops
  set-header Implementation: verified — durable adapter (`src/db.ts`)
  bump-version minor
  set-criterion 1: verified
  append-criterion [unverified] new signal — verified by `test/x.test.ts`
  append-requirement event: When <trigger>, the system shall <action>.
  replace-requirement ubiquitous 2: The system shall <action>.
  ```

Requirement sections: ubiquitous | event | state | unwanted | optional.
append-* ops resolve numbering/position at APPLY time, so several open
changes appending to the same spec never collide on numbers — order of
application decides.

For REMOVED: the body may be empty; on apply, the target spec file is
deleted and the capability is recorded in the change archive only.
-->

---

<!-- delta body below -->

```ops
bump-version minor
set-header Implementation: verified — the registry, the allowlist with `!` exclusions, MCP over HTTP and stdio, untrusted envelopes, the result cap, and the MCP client with the marketplace (`packages/hub/src/mcp/`: stdio and streamable HTTP, OAuth sign-in, keys as hub secrets, 37 free servers with their logos)
replace-requirement ubiquitous 9: The system shall keep the keys, tokens and sign-ins of connected servers as hub secrets encrypted with the vault's key, pass them only to the server they belong to (as its environment, an argument, its `Authorization` header or a parameter of its address), and never return them through the API.
append-requirement ubiquitous: The system shall list in its MCP marketplace only servers that are free to use (no account, a free plan or a free key), each checked before it is listed (its program starts and lists its tools, or its address answers `initialize`, and a sign-in lets Orbis register itself), each with its service's logo.
append-requirement unwanted: The system shall not show a key that goes in a server's address: the address the API returns and every error quote the address without it.
append-criterion [verified] A key that goes in the address reaches the server from the vault on every call and appears neither in the API nor in an error, and every marketplace entry has a logo file — verified by `packages/hub/test/mcp-servers.test.ts`.
```
