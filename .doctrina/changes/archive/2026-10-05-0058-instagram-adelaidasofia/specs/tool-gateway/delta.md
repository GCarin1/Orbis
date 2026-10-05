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
replace-requirement ubiquitous 14: The system shall list marketing servers in their own Marketplace category: the platforms' official ad servers signed in with the user's business account (Meta Ads, TikTok Ads), Google's official read-only Analytics server, and an Instagram server over the official Instagram Graph API for a Business or Creator account (adelaidasofia/instagram-mcp), pinned to the version whose code was read because it holds a token that can post.
append-requirement ubiquitous: The system shall treat as read-only, without asking, the tools a marketplace entry names as reads for a server that does not mark them itself, and keep asking first for every other tool of that server.
append-requirement unwanted: The system shall not start a connected marketplace program whose entry now runs another program (another command or other pinned arguments); it shall report the connection as an error that says to disconnect it and connect it again, and offer none of its tools until then.
replace-criterion 12: [verified] The Marketing category holds Meta Ads and TikTok Ads (hosted, sign-in), Google Analytics (pipx, read-only, its credentials file and project) and Instagram (adelaidasofia/instagram-mcp with pipx, pinned to 0.1.2, its token and app secret secret, its reads named and its writes not), with no mcpware server and no LinkedIn; Orbis's sign-in finds Meta's and TikTok's authorization servers from the metadata they publish and registers itself with each — verified by `packages/hub/test/mcp-marketing.test.ts`
append-criterion [verified] A tool a catalog entry names as a read is read-only and allowed without asking; a connection whose entry now starts another program is an error offering no tools, stays one on Reconnect, and starts the new program once connected again — verified by `packages/hub/test/mcp-marketing.test.ts`
append-criterion [verified] The phone's Debian installs `python3` and `pipx`, so the servers started with `pipx` run there — verified by `packages/hub/test/phone-script.test.ts`
```
