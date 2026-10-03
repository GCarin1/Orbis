# Spec Delta — capability: web-app

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/web-app/spec.md`

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
replace-requirement ubiquitous 16: The web app shall provide an MCP screen, named MCP in the sidebar, with two tabs. Explore holds a search, a filter for how a server connects (no account, sign-in, free key), categories with their counts, the servers to start with, and a card per server with its logo, name, category, where it runs, what it does, how it connects, whether it only reads, and Connect (or its state once connected). Connected lists each server with its logo, its state, the faces of the bots that may use it, a switch per bot, its tools with which only read and which ask first, and Reconnect and Disconnect in its ⋮ menu; with nothing connected, it says so and leads to Explore. Your own server opens a form for an address or a program.
append-requirement event: When the user opens a catalog server (its card or its name), the web app shall show its details in a sheet — on the right edge, the whole screen on a phone — with how it connects, where it runs (the program it starts or the address it calls), whether it only reads or asks before changing something, who may use it, and its key fields or its Connect button; Esc, the close button and the phone's Back close the sheet.
append-criterion [verified] Explore shows where to start until a search or a filter, filters by search, by how a server connects and by category, says when nothing matches and clears the filters; a card or its name opens the details with how it connects, the address, whether it only reads and who uses it, and Esc or Close shuts them; a key is asked in the details; Connected says when nothing is connected and sums up what is; a connected server's card says so; Reconnect waits in the ⋮ menu — verified by `packages/web/test/marketplace.test.tsx`.
```
