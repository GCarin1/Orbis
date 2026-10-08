# Change 0065-export-import — export-import

- **Status:** applied
- **Applied:** 2026-10-08
- **Date:** 2026-10-08
- **Owner:** Orbis maintainers
- **Lane:** runtime (confident; signals: secrets) — opened anyway (--force)
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

Phase 3 of moving Orbis to the cloud: the people who keep their bots on
their phones download everything into one file and bring it into another
hub or into their new account, losing nothing and adding nothing twice
(ADR 0022).

## What

- Hub: `packages/hub/src/export/` with `zip.ts` (ZIP writer and checked
  reader), `seal.ts` (scrypt + AES-256-GCM) and `service.ts` (the export,
  the import into a hub and into the cloud account, and the routes
  `POST /export`, `/import`, `/import/cloud`). Routines and MCP servers pick
  up imported rows at once (`reload`, `adoptNew`).
- Web: Settings → Data (`DataSettings.tsx`), with `api.exportData`,
  `api.importData` and `saveBlobFile`.
- Specs `cloud` and `web-app`, contract `hub-surface`, ADR 0022, and the
  guide `docs/cloud-migration.md`.

## Scope boundaries

- The files' bytes and the skills reach the cloud with its file storage
  (phase 5). The secrets reach a runner linked to the account (phase 4).
- Bots' workspaces and browser profiles are not exported: they are working
  copies.

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
