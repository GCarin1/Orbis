# Change 0070-oracle-only — oracle-only

- **Status:** applied
- **Applied:** 2026-10-11
- **Date:** 2026-10-11
- **Owner:** Claude Code (requested by the project owner: "Quero só Oracle… faça uma verificada de segurança")
- **Lane:** product
- **Affects specs:** cloud, cli, web-app

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

The user wants the project to stay simple: only the Oracle server and Supabase, with no Cloudflare. They asked
for a security check (auth, ports, leaked keys, Supabase access) and for two-step verification for accounts.

## What

- Removed the Cloudflare relay:
  - `packages/cloud` and `.github/workflows/cloud.yml`;
  - `packages/shared/src/relay.ts` and `packages/hub/src/relay/`;
  - `ORBIS_CLOUD_URL`, `PUT /device/cloud`, `DeviceStatus.cloud`;
  - `orbis link --cloud` and the phone-off notice;
  - `supabase/migrations/0004_drop_device_identity.sql`.
- HTTPS on the server:
  - Caddy in `deploy/docker-compose.yml` (profile `https`);
  - `deploy/Caddyfile` with the security headers;
  - `orbis-server install` asks for the address (`<ip>.sslip.io` by default) and opens 80 and 443;
  - a new `orbis-server token` command.
- Hub: `ORBIS_PUBLIC_URL`, which brings a trusted proxy on loopback and private networks, the public OAuth
  redirect, and a token of at least 24 characters.
- Two-step verification:
  - `aal` in the session claims;
  - the linked account's `mfa` flag;
  - `PUT /api/v1/account/mfa`;
  - the web app's code step at sign-in and the setup in Settings → Account (Supabase TOTP).
- Docs (`docs/server.md`, `docs/cloud-migration.md`, `docs/cloud.md`), contract, AGENTS.md, CHANGELOG and
  ADR 0026, which supersedes 0024 and 0025.

## Scope boundaries

- The device sync to Supabase (ADR 0023) stays as it is.
- No SSRF filter. Bots already have a shell on the user's own server, and the docs say so.
- The user does the Oracle security list, the Supabase redirect URLs and the leaked-password setting.

## Verification

- [x] Automated checks pass (`doctrina verify`, or the project's typecheck/test/build).
- [x] The affected spec's acceptance criteria are met and cite their evidence (`doctrina coverage`).
- [x] The Caddyfile is validated by Caddy 2.10 (`caddy validate`), and a live smoke test checked the headers
  and the proxy in front of a test hub.
- [x] Git history scanned for keys: only the redactor's fake fixtures. Supabase security advisors: no RLS
  findings.

## Open questions

<!-- List unresolved decisions. Empty if none. -->
