# Change 0088-buttons-say-why — buttons-say-why

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

Primary buttons stay enabled and say what is missing instead of greying out

## What

Primary buttons greyed out with no reason: Connect, Sign in, Generate candidates, Create routine, Sign in with
ChatGPT.

- `packages/web/src/components/Missing.tsx` (new): the line under a disabled button saying what it waits for.
- `TokenGate.tsx`, `HiringScreen.tsx`, `RoutinesPanel.tsx`, `ChatGptCard.tsx`: each says what is missing.
- `styles.css`: a disabled primary button keeps its colour, faded, instead of grey.

## Scope boundaries

- The composer's send button stays as it is: an empty message needs no explanation.

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
