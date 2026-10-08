# Spec Delta — capability: cloud

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/cloud/spec.md`

---

<!-- delta body below -->

```ops
set-header Implementation: partial — the account database (`supabase/migrations/0001_orbis_core.sql`), signing in with an email and a password (`packages/hub/src/auth/`, `packages/web/src/account.ts`, change 0064), the `.orbis` export and its import into a hub or the cloud account (`packages/hub/src/export/`, change 0065); the runner link and the Cloudflare deploy come in later changes
set-header Last updated: 2026-10-08
bump-version minor
append-requirement ubiquitous: The system shall export everything a hub keeps as one `.orbis` file: a manifest with the SHA-256 of every part, every table but the vault, the CLI sessions and the search index, the conversations' files and the skills, and, only when the user gives a password of at least 10 characters, the secrets sealed by it with scrypt and AES-256-GCM (ADR 0022).
append-requirement event: When a `.orbis` file is imported into a hub, the system shall write every row in one transaction, keep a row already there as it is, write the files, skills and secrets the hub lacks (the secrets only with the right password, into the hub's own vault), schedule its routines and offer its MCP servers at once.
append-requirement event: When a `.orbis` file is imported into the cloud account with that account's session, the system shall write each table under the session through the database's API, adding no row twice, and keep the secrets out of the cloud.
append-requirement unwanted: The system shall not import a file whose parts are missing, unlisted, changed or of a newer format, nor a file whose bots or squads take handles another bot or squad holds, writing nothing then.
append-requirement unwanted: The system shall not carry over a bot's consent to work on the user's own machine, the linked account, MCP OAuth sign-ins, nor runs and approvals still waiting.
append-criterion [verified] The file zips and unzips and refuses damaged parts and unsafe paths; the secrets open only with their password; an export holds every table but the vault, the files, the skills and the sealed secrets and nothing in clear; imported into an empty hub it brings everything (the secrets into its vault, the routine's webhook secret, the file, the skill, health), a "my computer" bot works in its own computer, a second import adds nothing, without the password everything but the secrets comes, a changed part, a handle another bot holds and a file that is no export are refused; into the cloud every table goes under the account's session in reference order as the cloud's columns take them, never a secret, never twice, and another session is refused; every exported column maps onto a cloud column of its type — verified by `packages/hub/test/export.test.ts`
```
