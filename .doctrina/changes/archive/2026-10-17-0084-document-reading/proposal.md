# Change 0084-document-reading — document-reading

- **Status:** applied
- **Applied:** 2026-10-17
- **Date:** 2026-10-17
- **Owner:**
- **Lane:** product
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

Bots read the documents the user sends: the hub turns a PDF into its text and page images before the bot starts, and answered approvals fold up

## What

The user sent an approved architectural project (one A0 AutoCAD sheet) to an engineering group. The bots could
not read it: the image had no poppler, so Claude Code's own PDF reading failed, and the bots took the PDF apart
with shell scripts (each one an approval card in the chat) and still could not see the drawing. CAD draws most
of its lettering as lines, so the PDF's text held only the notes.

- `packages/hub/src/files/documents.ts` (new): `DocumentReader` reads a PDF once with poppler — text, page
  images (≤ 20), tiles of a page bigger than A3 — and tesseract (scanned pages, a sheet's lettering), kept in
  `<data>/documents/<file id>/`.
- `packages/hub/src/files/service.ts`: reading starts on upload; `prepare(run, bot)` places the reading next to
  the PDF and describes it in the task (`describeDocument`); `imagesFor` adds the pages; `files.get` reads too.
- `packages/hub/src/runs/engine.ts`: `addPreparer` — async work before the brain starts, its text joined to the task.
- `Dockerfile`: `DOCUMENT_PACKAGES="poppler-utils tesseract-ocr tesseract-ocr-por"`; the phone setup installs poppler.
- `packages/web/src/components/Cards.tsx`: answered approvals fold to one line.

## Scope boundaries

- Word, Excel and other office files are not converted; only PDFs.
- No new approval rule: a bot's shell commands still follow its computer's settings.
- The desktop app (Windows) has no poppler: its bots are told the PDF could not be read inside.

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
