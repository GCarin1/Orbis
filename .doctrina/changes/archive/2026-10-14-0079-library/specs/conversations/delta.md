# Spec Delta — capability: conversations

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/conversations/spec.md`

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
append-requirement ubiquitous: The system shall keep a Library of every file sent in a conversation and every file put in it directly (`POST /api/v1/library/files`), listed newest first by kind, name, folder or archived, a page at a time, with where each came from (`chat`, `library`, `routine`, `skill`, `task`) — never an upload not yet sent.
append-requirement event: When the user deletes a Library file, the system shall remove its bytes and its row everywhere, and the message that carried it shall keep its place and show the file as deleted; when the user archives one, it shall leave the Library's lists and stay in its conversation.
append-requirement event: When the user forwards Library files to a bot or a group, the system shall copy them into that conversation and post them as the user's message, which wakes the bot or the group's lead with the files in its workspace.
append-requirement ubiquitous: The system shall keep Library folders, each with the bots and the groups that work on it, and give bots `library.list`, `library.get` and `library.save`, which see and write only the folders given to the bot or to a group it is a member of.
append-requirement ubiquitous: The system shall report how much space the files take, by kind, the largest ones, and the free space of the disk that holds the data.
append-criterion [verified] The Library lists every sent and directly added file by kind, name, folder and page, never an unsent upload, and a Library-only file is never swept; deleting removes it everywhere while its message stays; archiving hides it; forwarding copies it to a bot that wakes with it; folders hold files, bots and groups, and are deleted with or without their files; bots list, copy and keep files only in their folders; the space used is reported; folders and their files travel in an export — verified by `packages/hub/test/library.test.ts`
```
