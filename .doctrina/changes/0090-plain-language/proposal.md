# Change 0090-plain-language — plain-language

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

Plain language on screen: no tokens, file paths, environment variables or protocol names; MCP becomes Integrations

## What

The audit found technical words on screen: API token, ~/.orbis/token, orbis open, ORBIS_SUPABASE_URL=off, token counts, computer.*, MCP.

- `packages/web/src/i18n.ts`: the sign-in asks for the access code; accounts off says to ask whoever runs the server; Hiring and Usage speak of work and cost, not tokens; the tool policy explains itself; MCP is **Integrations**; the introductions of Skills, Squads, Brains, Hiring and Integrations shrink to one sentence.

## Scope boundaries

- The API, CLI and docs keep their technical names.

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
