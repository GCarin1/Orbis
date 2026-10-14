# Change 0079-library — library

- **Status:** applied
- **Applied:** 2026-10-14
- **Date:** 2026-10-14
- **Owner:**
- **Lane:** product (uncertain)
- **Affects specs:** conversations, web-app

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

The owner asked for a Library like ChatGPT's. It should hold every file of every conversation, take files added
directly, and let files be deleted, archived and forwarded to a bot. It should also have folders that bots, or a
whole group, work on. The attach button and bots sending files already exist (change 0059).

## What

- **Hub**
  - Migration 16 rebuilds `files`: the conversation becomes optional, with new `folder_id`, `archived_at` and
    `source` columns. It adds `library_folders`, `folder_bots` and `folder_groups`, synced and exported.
  - `packages/hub/src/library/service.ts` holds the routes, the `library.*` tools and the usage report.
  - `FilesService.store` and `send` take a folder and a source. The sweep keeps Library-only files.
- **Cloud:** `supabase/migrations/0005_library.sql` adds the columns, the tables with row level security, and
  `device_sync` for the new tables.
- **Web**
  - `LibraryScreen.tsx` and a Library item in the menu.
  - A deleted file shows as deleted in its message.
  - The `library.updated` event reloads the screen.
- **Docs:** `docs/files.md`, the `hub-surface` contract, ADR 0030 and the CHANGELOG.

## Scope boundaries

Tasks given to a folder's team and their progress board are change 0080. Image understanding for API brains is change 0081.

## Verification

<!--
How you will know the change is correctly applied. Use checkboxes: every
box here is a claim that must be PROVEN before the change is done.
`doctrina change archive` refuses to archive while any box below is
unchecked (pass --force to archive anyway and record the gap). Distinguish
"task marked done" from "verification passed" — link the evidence.
-->

- [x] Automated checks pass (`doctrina verify`).
- [x] The affected spec's acceptance criteria are met and cite their evidence: `packages/hub/test/library.test.ts`, `packages/web/test/library.test.tsx`.

## Open questions

<!-- List unresolved decisions. Empty if none. -->
