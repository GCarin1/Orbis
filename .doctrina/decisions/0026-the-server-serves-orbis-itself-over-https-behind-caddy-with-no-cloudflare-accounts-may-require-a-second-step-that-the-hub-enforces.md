# ADR 0026 — The server serves Orbis itself over HTTPS behind Caddy, with no Cloudflare; accounts may require a second step that the hub enforces

- **Status:** accepted
- **Scope:** cloud, web-app, cli, hub-api
- **Date:** 2026-10-11
- **Deciders:** project owner ("Quero só Oracle… se não algo que deveria ser simples e opensource vira um bicho enorme"; asked for a check of auth, ports and two-step verification), Claude Code
- **Supersedes:** 0024, 0025
- **Superseded by:** —
- **Evidence:** `deploy/Caddyfile`, `deploy/docker-compose.yml`, `scripts/server/orbis-server.sh`, `packages/hub/src/auth/account.ts`, `packages/hub/src/config.ts`, `packages/web/src/account.ts`
- **Landed:** 2026-10-11 — `deploy/Caddyfile`, `scripts/server/orbis-server.sh`, `packages/hub/src/auth/account.ts`

## Context

ADR 0025 moved the bots to an always-on free server, Oracle Cloud's Always
Free VM. ADR 0024 put a Cloudflare Worker and Durable Objects in front, as
a relay. That relay was a second deployable with its own secrets, workflow
and protocol. The user wants the open-source project kept simple: one
server, plus Supabase for the accounts. Once the hub is exposed directly,
the sign-in, the ports and the headers must hold on their own.

## Decision

- **The server is the only place Orbis runs.** The hub serves the web app
  and its API as it always did. Caddy (in `deploy/docker-compose.yml`,
  profile `https`) sits in front and gets and renews a free certificate for
  `$ORBIS_DOMAIN`: the user's domain, else `<public-ip>.sslip.io`.
- **Only 22, 80 and 443 are open.** `orbis-server install` opens 80 and 443
  in the VM's firewall; the user opens them in Oracle's security list. The
  hub's 7420 listens on the machine only.
- **Headers on every answer** (`deploy/Caddyfile`): HSTS, a CSP of `'self'`
  plus the Supabase project (the one inline script by hash), `X-Frame-Options:
  DENY` (SAMEORIGIN for the computer's live view, which the app frames),
  `nosniff`, `Referrer-Policy: no-referrer` and a Permissions-Policy.
- **The hub knows it is public.** With `ORBIS_PUBLIC_URL`:
  - it takes the visitor's address from `X-Forwarded-For`, trusted only from
    loopback and private networks, so 20 refused sign-ins a minute count
    per visitor;
  - MCP sign-ins return to the public address;
  - it refuses to start with an `ORBIS_TOKEN` shorter than 24 characters.
- **Two-step verification, optional, enforced by the hub.** The account sets
  up an authenticator (Supabase Auth TOTP) in Settings → Account and signs
  in with its code after the password.
  - The linked account records `mfa`. While it is on, an account session
    without `aal: aal2` is refused like an unknown credential.
  - Only the hub's token or an `aal2` session turns it on or off.
  - The hub's token remains the recovery key.
- **Removed:** `packages/cloud` (the Worker and the Durable Object), its
  workflow, the relay frames and client, `ORBIS_CLOUD_URL`, `orbis link
  --cloud` and the phone-off notice. Also `device_identity` in Supabase
  (`supabase/migrations/0004_drop_device_identity.sql`).
- **Kept from ADR 0025:** the server runner in Docker, `orbis-server`,
  `orbis data export|import`, and Termux as optional. A device link still
  keeps a copy of the hub's data in the account (ADR 0023).

## Alternatives considered

1. Keep the Cloudflare relay (ADR 0024): free, with an edge in front, but
   one more deployable, protocol and set of secrets for a project people
   should be able to run in an afternoon.
2. A Cloudflare tunnel in front of the VM: still a Cloudflare account and
   token, and it adds nothing the VM's own HTTPS lacks for this use.
3. Two-step verification enforced only by Supabase: the hub checks the
   session itself, so it must check the `aal` too, or a password-only
   session would still open it.

## Consequences

**Positive**

- One server and Supabase: fewer pieces, fewer secrets, simpler to explain.
- Accounts can require an authenticator's code, and the hub enforces it.

**Negative**

- The hub faces the internet directly. Its own limits (sign-in failures,
  pairing tries, tickets, file keys) and Caddy's headers are the defense,
  with no edge in front.
- With the server off, the app does not load. There is no notice page.

**Neutral**

- `sslip.io` gives a working HTTPS address without buying a domain. A
  domain of the user's own can replace it at any time.
