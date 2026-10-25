# Change 0096-library-tidy — library-tidy

- **Status:** applied
- **Applied:** 2026-10-25
- **Date:** 2026-10-25
- **Owner:**
- **Lane:** product
- **Affects specs:** web-app

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

Library: storage in one line, folders as their own section, thumbnails cropped

## What

The audit found the space card above the files, mixing the server's disk with Orbis's bytes; Folders as a tab beside file kinds; names cut after one line. (It also reported photos drawn as a strip: that came from a truncated test image in the audit's own seed data, not from the app; with a valid image the thumbnail already fills its tile.)

- `LibraryScreen.tsx`: folders are a section above the grid on All; the Folders tab is gone; the space used is one quiet line under the files ("Orbis uses 4 KB · 200 GB free on the disk") that opens the card, and the card shows on its own once the disk is 90% full.
- `styles.css`: file names take two lines.

## Scope boundaries

- The Library's routes and the usage numbers are unchanged.

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
