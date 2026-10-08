# ADR 0022 — A .orbis export carries a hub's data as one checked file, its secrets sealed by the user's password; it imports into a hub or the cloud account without duplicates and never carries a consent or a secret to the cloud

- **Status:** accepted
- **Scope:** cloud, web-app, secrets
- **Date:** 2026-10-08
- **Deciders:** project owner (requirement: "inclua uma forma de exportar os dados locais baixar eles e depois importar em sua nova conta"; "Pode começar a fase 3"), Claude Code
- **Supersedes:** —
- **Superseded by:** —
- **Evidence:** `packages/hub/src/export/service.ts`, `packages/hub/src/export/zip.ts`, `packages/hub/src/export/seal.ts`, `packages/web/src/components/DataSettings.tsx`
- **Landed:** 2026-10-08 — `packages/hub/src/export/service.ts`, `packages/hub/src/export/zip.ts`, `packages/hub/src/export/seal.ts`, `packages/web/src/components/DataSettings.tsx`

## Context

Two people keep their bots on their phones' hubs (ADR 0018). Moving to cloud
accounts (ADR 0020) must lose nothing. The vault encrypts each secret with
the hub's own key, bound to its owner and name, so the bytes of one hub's
vault do not open on another. Some settings belong to the machine, not to
the data: the linked account, a bot's consent to work on "my computer"
(ADR 0009), MCP OAuth sign-ins made for the old hub's address.

## Decision

- **One file, `.orbis`: a ZIP.** It holds:
  - `manifest.json` (format and schema version, counts, and the SHA-256
    of every part);
  - one JSON Lines part per table (every table but the vault, the CLI
    sessions and the search index);
  - the conversations' files;
  - every SKILL.md.

  The hub writes and reads it with its own small ZIP code (Node's zlib), no
  dependency. A read refuses unsafe paths, sizes past the limits, any part
  missing from the manifest or not listed in it, and any hash that does not
  match.
- **Secrets only sealed by a password the user chooses** (at least 10
  characters). They are decrypted from the vault and sealed again with
  scrypt and AES-256-GCM into `secrets.sealed.json`. Without a password the
  file holds no secret. MCP OAuth sign-ins are never exported.
- **Import into a hub** (`POST /api/v1/import`):
  - All the rows go in one transaction, with references checked at its
    end. A row already there is kept as it is (`INSERT OR IGNORE`), so
    importing again adds nothing.
  - Another bot or squad already holding a handle stops the import (409)
    before anything is written.
  - Files and skills the hub lacks are written. The secrets go into this
    hub's vault, never over one it has.
  - Routines keep their webhook secrets, or get new ones when the file has
    none.
  - The hub schedules the new routines and offers the new MCP servers at
    once.
- **Import into the cloud account** (`POST /api/v1/import/cloud`, with the
  account's session):
  - The hub checks the session, then writes each table in reference order
    to Supabase's REST API under that session. Row level security keeps the
    rows in that account, and `ignore-duplicates` keeps a second import
    from adding anything.
  - Secrets, skills and the files' bytes stay in the file until the cloud
    keeps them (the runner link and the cloud's file storage, later
    changes).
- **Never carried over:**
  - work on "my computer": the bot works in its own isolated computer
    instead;
  - the linked account and the last activity;
  - runs and approvals still waiting: they arrive cancelled and expired.

## Alternatives considered

1. Copy `orbis.db` and `master.key`: the vault's key would travel in
   clear, the copy would carry this machine's settings, and the cloud could
   not read it.
2. Export the vault's ciphertext and the master key sealed together: the
   same secret in two forms, and the cloud would get a key to every secret.
3. A ZIP library (JSZip, fflate): a dependency for what Node's zlib does.
4. Import into the cloud from the browser: the page would have to read
   ZIP files, check hashes and know every table. The hub already knows its
   data.

## Consequences

**Positive**

- The move to an account loses nothing, and a second import is harmless.
- A lost file without its password exposes no key.

**Negative**

- A forgotten export password means setting the bots' keys again.
- MCP servers signed in with an account, and "my computer" bots, need the
  user once more after an import.
- The whole file is held in memory (512 MB at most).

**Neutral**

- `cloud-schema.test.ts` and `export.test.ts` keep the hub's tables, the
  export and the cloud schema in step.
