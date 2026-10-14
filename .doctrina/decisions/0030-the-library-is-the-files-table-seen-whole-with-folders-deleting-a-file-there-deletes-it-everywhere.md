# ADR 0030 — The Library is the files table seen whole, with folders; deleting a file there deletes it everywhere

- **Status:** accepted
- **Date:** 2026-10-14
- **Deciders:** the project owner
- **Supersedes:** —
- **Superseded by:** —
- **Evidence:** `packages/hub/src/library/service.ts`, `packages/hub/src/db/migrations.ts`, `packages/hub/test/library.test.ts`
- **Landed:** 2026-10-14 — `packages/hub/src/library/service.ts`, `packages/hub/test/library.test.ts`

<!--
Evidence anchors the decision to reality. Once accepted, cite the file(s)
that prove this decision is actually implemented, in backticks, e.g.
"- **Evidence:** `proto/order.proto`, `services/gateway/grpc.ts`".
`doctrina validate` warns when cited evidence is missing on disk (the
decision drifted from the code) or when an accepted ADR cites none. For a
process decision with no code artifact, write "n/a — <why>".

Landed is the non-mutating "this decision is now implemented and verified
here" stamp. Many ADRs are accepted at design time with "Evidence: n/a — no
implementation yet"; once the capability ships, run
"doctrina decision land NNNN `path/to/proof.ts` ..." to record the date and
proof without editing the immutable body. A filled Landed satisfies the
accepted-ADR evidence check.
-->

## Context

Files lived only inside their conversation (change 0059). The owner asked for a Library, like ChatGPT's: every
file of every conversation in one place, and the ability to:
- add files directly;
- delete, archive and forward files;
- make folders that a team of bots works on.

## Decision

The Library is the `files` table seen whole; it is not a second store.
- **Files.** A file may now have no conversation (put in the Library directly), sit in a folder, be archived, and
  record its source (`chat`, `library`, `routine`, `skill` or `task`).
- **Deleting** removes the bytes and the row everywhere. The message that carried the file stays and shows it
  as deleted.
- **Archiving** only hides the file from the Library's lists.
- **Forwarding** copies the file into the target conversation, so the original keeps its own life.
- **Folders** (`library_folders`) record the bots and the groups that work on them.
- **Bot access.** A bot reaches a folder only when it is given that folder, directly or through a group it is
  in. It does so through `library.list`, `library.get` and `library.save`.

## Alternatives considered

1. A separate library store that copies the conversation files: two copies of every byte, and deleting from one
   would leave the other.
2. A hidden "Library" conversation for the files added directly: every list and rule would have to skip it.
3. Every bot sees every folder: bots doing one task would read unrelated material, and the owner could not keep
   a folder private.

## Consequences

**Positive**

- One place for every file; space is counted once.
- Routines and skills fill the Library with no new mechanism: they already send files.

**Negative**

- The `files` table had to be rebuilt (SQLite keeps NOT NULL), and the cloud schema needs `0005_library.sql`.

**Neutral**

- Forwarded files count twice toward space, as they are separate copies.

<!--
Once this ADR is accepted, do not edit it. To change the decision,
create a new ADR that supersedes this one and update the "Superseded by"
header above to point at the new ADR. Status transitions:
proposed -> accepted | rejected
accepted -> deprecated | superseded by NNNN
-->
