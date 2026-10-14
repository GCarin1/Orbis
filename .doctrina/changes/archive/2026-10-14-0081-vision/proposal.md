# Change 0081-vision — vision

- **Status:** applied
- **Applied:** 2026-10-14
- **Date:** 2026-10-14
- **Owner:**
- **Lane:** product (uncertain)
- **Affects specs:** agent-runtimes

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

The owner chose "Bots enxergam imagens" among the Library's extras. The CLI brains already open images from
disk. The API brains got only the file's path and never saw the picture (change 0059 left it out of scope).

## What

- `FilesService.imagesFor(run)` returns the images of the message that started a run. Only PNG, JPEG, GIF and
  WebP qualify, up to 5 MB each and at most 5.
- The engine passes them to the brain as `BrainInput.images`.
- `brains/anthropic.ts` sends image blocks on the last user turn.
- `brains/openai.ts` (`chatMessages`) sends data URLs, only for a remote `openai` brain. Local models keep the
  paths.
- Docs (`docs/files.md`) and the CHANGELOG are updated.

## Scope boundaries

Images a bot copies later with `files.get` or `library.get` still reach API brains as paths only.

## Verification

<!--
How you will know the change is correctly applied. Use checkboxes: every
box here is a claim that must be PROVEN before the change is done.
`doctrina change archive` refuses to archive while any box below is
unchecked (pass --force to archive anyway and record the gap). Distinguish
"task marked done" from "verification passed" — link the evidence.
-->

- [x] Automated checks pass (`doctrina verify`).
- [x] The affected spec's acceptance criteria are met and cite their evidence: `packages/hub/test/vision.test.ts`.

## Open questions

<!-- List unresolved decisions. Empty if none. -->
