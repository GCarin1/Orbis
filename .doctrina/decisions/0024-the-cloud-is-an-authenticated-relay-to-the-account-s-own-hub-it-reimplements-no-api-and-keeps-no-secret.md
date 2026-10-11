# ADR 0024 — The cloud is an authenticated relay to the account's own hub; it reimplements no API and keeps no secret

- **Status:** accepted
- **Scope:** cloud, web-app, cli, hub-api
- **Date:** 2026-10-11
- **Deciders:** project owner (requirement: Orbis in the cloud on Cloudflare's free plan, "vamos para a fase 5"; deploy through GitHub Actions; a simple notice while the phone is off), Claude Code
- **Supersedes:** —
- **Superseded by:** —
- **Evidence:** `packages/cloud/src/worker.ts`, `packages/cloud/src/account.ts`, `packages/hub/src/relay/client.ts`, `supabase/migrations/0003_device_identity.sql`, `.github/workflows/cloud.yml`
- **Landed:** 2026-10-11 — `packages/cloud/src/worker.ts`, `packages/cloud/src/account.ts`, `packages/hub/src/relay/client.ts`

## Context

ADR 0020 keeps the bots running on the user's phone: Cloudflare Containers
are not on the free plan, and a Worker runs no process and no SQLite of the
hub. The hub has dozens of routes. ADR 0023 made the phone a device of its
account, with a token of its own. What is missing is reaching that hub from
anywhere, through the cloud, without opening a port of the phone.

## Decision

- **A relay, not a second API.** The cloud's Worker serves the web app from
  its static assets. Every other request under `/api/` and `/v1/` is relayed
  to the account's own hub, and the hub's own routes answer it. Nothing of
  the API is written twice.
- **One Durable Object per account** (`Account`, SQLite, free plan). It
  holds the one WebSocket the hub opens out to the cloud, and the event
  streams of the account's browsers. It uses the hibernation API, so an idle
  relay costs nothing. The hub's ping is answered without waking it.
- **The hub dials out.** Once linked as a device and with a cloud address
  (`ORBIS_CLOUD_URL`, else the address chosen at `orbis link --cloud`, else
  the published cloud), the hub opens `wss://<cloud>/runner`. It sends the
  device token in the upgrade's `Authorization: Device …` header, never in
  the address.
  - The Worker asks Supabase (`device_identity`, the token's hash only)
    whose device it is. It hands the socket to that account's object
    without the token.
  - The newest hub of an account wins; the one it replaces is told so and
    waits five minutes.
  - A relay an hour old is closed so its token is checked again: a revoked
    device drops off.
- **A browser proves its account twice.** The Worker checks the Supabase
  session (WebCrypto, the project's JWKS, the hub's rule) before anything
  reaches an account. The hub checks it again on the relayed request, as the
  session of the account linked to it.
  - The stream ticket and the file key the hub hands out come back as
    `<account>~<the hub's own value>`, so the cloud knows where a WebSocket
    or an `<img>` goes. The hub still checks its own part.
- **Frames.** Requests, answers and streams cross the one socket as JSON
  frames (`packages/shared/src/relay.ts`). Bodies go in pieces of 512 KB
  (base64), under the cloud's 1 MiB message limit, up to 30 MB a body. The
  hub answers with `inject`, so its auth and validation run as for a direct
  request. It opens streams with `injectWS`.
- **The phone off.** With no hub connected, the object answers 503
  `runner_offline`. The web app shows "your phone is off or offline". When
  the hub leaves, waiting requests get the same answer and open streams
  close.
- **What the cloud refuses.** Pairing, the device and account links, and
  unlinking the account all need the hub's own token, so they are 404 in the
  cloud.
- **Security headers on every answer.** HSTS, a CSP of the own origin plus
  the Supabase project (the one inline script by hash), `X-Frame-Options:
  DENY`, `nosniff`, `Referrer-Policy: no-referrer`.
- **Limits and logs.** 300 requests a minute per address (the Workers rate
  limit binding) and 600 per account. No CORS. No request logs: a ticket or
  file key travels in an address.
- **No secret in the Worker.** The only configuration is the Supabase
  address and its publishable key, which are public. No service role.
- **Deploy.** `.github/workflows/cloud.yml` builds, tests and runs
  `wrangler deploy` with the repository secrets `CLOUDFLARE_API_TOKEN` and
  `CLOUDFLARE_ACCOUNT_ID`, then checks the headers and a 401.

## Alternatives considered

1. Reimplement the API in the Worker over Supabase: a second implementation
   of every route, and the bots still need the phone to run.
2. Cloudflare Containers running the hub: not on the free plan.
3. A tunnel from the phone (cloudflared): it exposes the hub's own token
   surface to the internet and needs a binary on the phone.
4. The device token in the first WebSocket message, as first planned: the
   Worker would accept an unauthenticated socket before knowing the
   account. The upgrade header is checked before any socket exists.
5. Polling the cloud for work: slower, and many more requests on the free
   plan than one hibernating socket.

## Consequences

**Positive**

- The whole app works from anywhere with the same code. Secrets and the
  bots' work stay on the phone.
- Cost stays at zero for light use: an idle relay hibernates.

**Negative**

- With the phone off, the app only says so. The history read from Supabase
  is left for later.
- Every stream event wakes the account's object (it counts against the free
  plan's requests). This is fine for light use.
- The computer's live view and MCP OAuth callbacks are not relayed (they are
  not under `/api/`).

**Neutral**

- The published address is the Worker `orbis` on the account's
  `workers.dev` subdomain. Until it is set as the default, a hub names it
  with `orbis link --cloud`.
