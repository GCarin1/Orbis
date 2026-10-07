# Change 0059-files-conversations-sends-bots — Files in conversations: the user sends files and bots receive them in their workspace; bots send files they generate; files kept and listed per conversation

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

Files in conversations: the user sends files and bots receive them in their workspace; bots send files they generate; files kept and listed per conversation

## What

- Hub: `packages/hub/src/files/service.ts` keeps each file's bytes in
  `<data>/files/<id>` and its row in a new `files` table (migration 12);
  upload (`POST /conversations/:id/files`), list and content routes; the
  content takes the token in the address and is sandboxed. A user's
  message names its files in `attachments`; each bot it wakes gets them in
  `orbis-files/` of its workspace and their description in its task.
  Tools `files.list`, `files.get`, `files.send`. Files go with their
  conversation; unsent uploads after a day.
- Shared: `ConversationFile`, `TimelineItem.files`.
- Web: the composer's clip, paste and drop with chips; images, players
  and file cards in messages; the image viewer; the Files list in a bot's
  ⋮ menu and in a group's info and menu.
- Android: `saveFile` to Downloads; more than one file picked at once.
- Specs: conversations, web-app, android-app. Docs: `docs/files.md`,
  README, CHANGELOG, the hub-surface contract.

## Scope boundaries

- Brains that take images (vision) still get a path, not the image itself.
- No quota per conversation beyond the per-file and per-message limits.

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
