# ADR 0002 — SQLite through node:sqlite as the only datastore

- **Status:** accepted
- **Scope:** bots, conversations, memory, routines, secrets, usage
- **Date:** 2026-09-27
- **Deciders:** Claude Code
- **Supersedes:** —
- **Superseded by:** —
- **Evidence:** n/a — no implementation yet; land with the walking skeleton
- **Landed:** 2026-09-27 — `packages/hub/src/db/index.ts`, `packages/hub/src/db/migrations.ts`

## Context

Orbis is self-hosted by default and must run on a laptop with no database
server. The research proposed PostgreSQL with pgvector, which suits a hosted
multi-tenant service, not a desktop install. Memory needs full-text search.
The desktop app must not depend on native modules compiled against a
specific Node.js or Electron ABI.

## Decision

All state lives in one SQLite file in the data directory, opened through
the built-in `node:sqlite` module (no native dependency), in WAL mode, with
FTS5 for memory search. Schema changes are numbered SQL migrations applied at
start. Files that are not rows (workspaces, browser profiles, skills as
SKILL.md, the master key, the token) live next to the database in the data
directory.

## Alternatives considered

1. PostgreSQL + pgvector — rejected for the MVP: a server to install and run.
2. `better-sqlite3` — rejected: a native module that must be rebuilt per
   Node.js and Electron version.
3. A JSON file store — rejected: no transactions, no full-text search.

## Consequences

**Positive**

- Zero-install persistence; backup is copying one directory.
- FTS5 search with no extra service.

**Negative**

- `node:sqlite` still prints an experimental warning on Node.js 22; the hub
  filters that one warning.
- One writer at a time; fine for one installation, not for a hosted fleet.

**Neutral**

- A PostgreSQL adapter stays possible behind the repository layer if a
  hosted deployment ever needs it.
