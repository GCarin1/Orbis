# ADR 0020 — Account data lives in Supabase Postgres closed by row level security to its owner; the phone runner keeps its SQLite and its secrets and syncs

- **Status:** accepted
- **Scope:** cloud, hub-api, secrets
- **Date:** 2026-10-08
- **Deciders:** project owner (requirement: "planeje a migração da nossa aplicação para a backend claudflare e o supabase … exportar os dados locais … login email e senha … se preocupe com autêntica e segurança"; "uma forma gratuita para baixo uso"), Claude Code
- **Supersedes:** —
- **Superseded by:** —
- **Evidence:** `supabase/migrations/0001_orbis_core.sql`, `packages/hub/test/cloud-schema.test.ts`
- **Landed:** 2026-10-08 — `supabase/migrations/0001_orbis_core.sql`, `packages/hub/test/cloud-schema.test.ts`

## Context

Each user runs their own hub today: on their phone inside Termux
(ADR 0018) or on a computer. One static token opens it, and its data
sits in a local SQLite file. The owner wants accounts with an email and a
password, the backend and the database in the cloud (Cloudflare and
Supabase), and the data that two people already keep on their phones
brought into their new accounts. It must cost nothing at low use.

- Cloudflare Workers runs no processes and has no `node:sqlite`. The hub
  runs brain CLIs, `computer.shell`, stdio MCP servers and a browser.
  Cloudflare Containers would run it, but only on the paid plan
  (US$ 5/month).
- The hub makes about 570 synchronous SQLite calls. Moving it to an
  asynchronous Postgres client would rewrite most of it.
- With the database on the internet, one account must never read another,
  and the bots' secrets (API keys, OAuth tokens) must not become a cloud
  breach.

## Decision

- **The cloud keeps the account's data in Supabase Postgres** (project
  `orbis`, `sa-east-1`, free plan). The schema is versioned in
  `supabase/migrations/`. Every table of the hub has a twin there, except
  the vault (`secrets`).
- **Every row belongs to one account**: `owner_id uuid not null default
  auth.uid() references auth.users on delete cascade`. Primary keys are
  `(owner_id, id)` and foreign keys carry `owner_id`, so a row can only
  point at rows of the same account. Deleting the account deletes its data.
- **Row level security is enabled and forced on every table.** The only
  policies are for the `authenticated` role, with `owner_id = (select
  auth.uid())`. `anon` has no grant at all.
- **No secret goes to the cloud.** There is no vault table. A setting
  named `secret:…` is refused by a check. Routines keep no webhook secret
  there. A runner device keeps only the SHA-256 hash of its token, and
  the account cannot read that column.
- **The phone runner keeps executing the bots, with its own SQLite and
  vault.** It connects outwards to the cloud with a revocable device token
  and syncs its rows (a later change). The web app, the API and the live
  stream move to Cloudflare's free tier (Workers, a Durable Object per
  account, R2 for files) in later changes.
- Sign-in is Supabase Auth with an email and a password. A user's
  `profiles` row is created by a trigger when they sign up.

## Alternatives considered

1. The hub in Cloudflare Containers, its SQLite replaced by Postgres: it
   costs US$ 5/month and rewrites most of the hub. It stays an upgrade for
   later, on the same data.
2. Cloudflare D1 as the database: no Auth, no row level security, and the
   owner already uses Supabase. Every query would have to filter by owner by
   hand.
3. One Supabase project per user: no shared sign-in, and the free plan
   allows two active projects.
4. Secrets in the cloud, encrypted with a key held by the Worker: one
   breach of the Worker opens every account's keys. On the phone they stay
   with their owner.

## Consequences

**Positive**

- Isolation lives in the database: a bug in the API cannot read another
  account's rows.
- Nothing that runs today changes. The local hub keeps working while the
  cloud is built.
- The free tiers cover low use.

**Negative**

- With the phone off, the bots do not answer. The app shows the history
  and queues messages.
- Two copies of the data (the phone and the cloud) need a sync, with its
  conflicts.
- MCP OAuth connections and API keys must be set again on each runner.

**Neutral**

- The test `cloud-schema.test.ts` fails when a hub migration adds a table
  with no cloud twin.
