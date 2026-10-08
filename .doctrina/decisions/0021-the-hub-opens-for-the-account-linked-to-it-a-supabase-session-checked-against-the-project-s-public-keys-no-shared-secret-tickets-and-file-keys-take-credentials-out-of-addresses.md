# ADR 0021 — The hub opens for the account linked to it: a Supabase session checked against the project's public keys, no shared secret; tickets and file keys take credentials out of addresses

- **Status:** accepted
- **Scope:** hub-api, web-app, cloud, cli
- **Date:** 2026-10-08
- **Deciders:** project owner (requirement: "quero que possa ser possível fazer login email e senha e quero que você se preocupe com autêntica e segurança"; "Pode começar a fase 2"), Claude Code
- **Supersedes:** —
- **Superseded by:** —
- **Evidence:** `packages/hub/src/auth/jwt.ts`, `packages/hub/src/auth/account.ts`, `packages/web/src/account.ts`
- **Landed:** 2026-10-08 — `packages/hub/src/auth/jwt.ts`, `packages/hub/src/auth/account.ts`, `packages/web/src/account.ts`

## Context

ADR 0020 put accounts in Supabase. Their sign-in (an email and a password)
must open Orbis before the cloud's own API exists (a later change), so the
hub on the phone or the computer must take it.

- A hub opens today with one static token. The stream and file links carry
  it in their address (`?token=`), where logs and browser history keep it.
- Supabase Auth signs its sessions with a private key (ES256) and publishes
  the public keys (JWKS). A legacy shared secret (HS256) also exists. Whoever
  holds it can forge sessions.
- A hub runs bots that run commands: whoever opens it controls that
  computer.

## Decision

- **A hub belongs to at most one account.** Only someone signed in with the
  hub's token links one (`POST /api/v1/account/link` with the account's
  session). Unlinking stops every session of that account at once.
- **The hub checks a session itself, with the project's public keys only.**
  It accepts ES256 or RS256 with a known key id, the project's issuer,
  `aud` and `role` `authenticated`, not anonymous, in time (30 s of
  clock skew), and `sub` the linked account. It never accepts `none` nor
  HS256, and keeps no secret of the project. The keys are kept 10 minutes,
  and fetched again for an unknown key id (a rotation) at most every 30 s.
- **No credential in an address.**
  - The stream opens with a one-time ticket (60 s) asked with the bearer
    header.
  - A file's content opens with a file key (HMAC under a secret of the
    hub's run, an hour, file content only).
  - `?token=` works nowhere any more.
- **Refusals are limited, never the owner.** Past 20 refused credentials a
  minute from one address, a refusal answers 429. A valid credential always
  passes, since a tunnel gives every visitor one address.
- **The web app talks to Supabase Auth over its REST API** with the
  publishable key: sign in, create an account, email a reset link back to
  the page, set a new password. The session stays on the device and is
  renewed a minute before it ends. The hub's token, when there is one, comes
  first.
- The Orbis project and its publishable key are the hub's defaults (both
  are public by design). `ORBIS_SUPABASE_URL=off` turns accounts off.

## Alternatives considered

1. Verify sessions with the project's JWT secret (HS256): a shared secret on
   every hub, and a forged session for anyone who reads it.
2. Ask Supabase for every request (`GET /auth/v1/user`): a network round trip
   per request, and no hub without internet.
3. Any account opens any hub: anyone who signs up would control the owner's
   computer.
4. Signed links per file: the timeline shows many files, and each would need
   a call to the hub.
5. The `@supabase/supabase-js` client: a large dependency for five REST calls.

## Consequences

**Positive**

- The owner signs in from any device with an email and a password. Supabase
  confirms the email and blocks leaked passwords.
- The token no longer appears in logs or history through the stream or file
  addresses.
- The same checks serve the cloud's API later.

**Negative**

- Signing in with the account needs the internet: the hub fetches the keys,
  the page renews the session. The token keeps working offline.
- A file key dies when the hub restarts: the page asks for a new one when it
  reconnects.
- Clients that put the token in the stream's address (older CLIs) must ask
  for a ticket.

**Neutral**

- Reset and confirmation links must point to addresses listed in the
  project's Redirect URLs.
