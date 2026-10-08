# Orbis in the cloud — Cloudflare + Supabase

Orbis is moving from one hub per person (on the phone in Termux, or on a
computer) to **accounts in the cloud** with an email and a password. The
data of a local hub comes along through an export file. Everything runs
on free tiers at low use (ADR 0020).

## Architecture

| Part | Where (free tier) | Role |
|---|---|---|
| Web app | Cloudflare Workers Static Assets | Served from the edge; the APK opens it from anywhere |
| API and edge | A Cloudflare Worker | Checks the Supabase session, rate limits, reads and writes the account's data |
| Live stream and run queue | A Durable Object per account (SQLite) | The web app's WebSocket; the runs waiting for the runner |
| Runner | The current hub, on the phone in Termux | Runs the bots (brain CLIs, shell, stdio MCP servers, Health Connect) and keeps the secrets; connects outwards, opens no port |
| Database | Supabase Postgres, project `orbis` | The account's data, closed by row level security |
| Sign-in | Supabase Auth, email and password | Replaces the hub's single token |
| Files | Cloudflare R2, private, short signed links | Replaces `<data>/files` |

Cloudflare Containers would run the runner in the cloud too, but only on
the paid plan (US$ 5/month). With the phone off, the app shows the history
and queues messages; the bots answer when the runner is back.

## Phases

1. **Account database** (change 0063, done) — the schema below, applied to
   the Supabase project.
2. **Sign-in** (change 0064, done) — the hub opens for the Orbis account
   linked to it; see [Signing in with an account](#signing-in-with-an-account-phase-2).
3. **Export and import** — *Settings → Data → Download my data* on the
   local hub writes an `.orbis` file: a manifest with the SHA-256 of each
   part, one JSON Lines file per table, the files, and the secrets
   encrypted with an export password (scrypt + AES-256-GCM). Signed in to
   the cloud, *Import data* checks the manifest and the hashes, gives the
   rows to the account and reports what came in. Importing again adds no
   duplicates. MCP OAuth connections must be made again.
4. **The runner linked to the account** — `orbis-phone link`: sign in once
   on the phone; it gets a device token, limited to running the account's
   bots and revocable from the web app.
5. **Deploy** — the Worker, the Durable Object and R2 with `wrangler`, from
   GitHub Actions.
6. **Moving over** — each person exports on the phone, creates an account,
   imports, checks, and points the app at the cloud address.

## The account database (phase 1)

- Project `orbis`, ref `tqjxkgxmnkypzbpirztw`, region `sa-east-1`
  (São Paulo), free plan.
- Schema: `supabase/migrations/0001_orbis_core.sql`.
  - Every table of the hub has a twin, but the vault (`secrets`).
  - Every row has `owner_id`, which defaults to the signed-in user and is
    deleted with them.
  - Keys are `(owner_id, id)`, and every reference carries `owner_id`.
- Row level security is enabled and forced on every table.
  - The signed-in user reads and writes only their own rows.
  - Anonymous visitors have no grant at all.
- No secret is kept there.
  - A setting named `secret:…` is refused.
  - Routines keep no webhook secret.
  - `devices` keeps only the SHA-256 hash of a runner token, which the
    account cannot read.
- `profiles` is created by a trigger on sign-up.
- `packages/hub/test/cloud-schema.test.ts` fails when a hub migration
  adds a table with no cloud twin.

Checked on the live project:

- The security and performance advisors report no finding.
- With two test users, B read none of A's rows and could not write as A.
- A `secret:` setting was refused, and so was reading a device token hash.
- `anon` read nothing.

### Auth settings to set in the dashboard

In Supabase → Authentication:

- **Sign In / Providers → Email**: enabled, **Confirm email** on.
- **Passwords**: minimum length **10**, require letters and digits, and
  **leaked password protection** on.
- **URL Configuration**: the site URL of the web app once deployed
  (phase 5).
- **Rate limits**: keep the defaults for sign-ins and emails.
- **MFA**: TOTP allowed (optional for each user).

## Signing in with an account (phase 2)

A hub belongs to at most one account. To link yours:

1. Open Orbis with the hub's token, as today.
2. Go to **Settings → Account**. Sign in to your account, or create it and
   confirm it from the email.
3. Press **Link this hub to my account**.

From then on any device opens this hub with your email and password: the
sign-in screen asks for them first. The token and pairing codes keep
working. **Unlink the account** signs every device out of it at once.

How it is protected (ADR 0021):

- The hub checks each session against the project's public keys (JWKS). It
  keeps no secret of the project, and accepts only ES256/RS256 sessions of
  the linked account, from this project, in time. A session alone never
  links an account: only the hub's token does.
- No credential goes in an address:
  - the stream opens with a one-time ticket (60 s);
  - a file opens with a file key (an hour, file content only);
  - `?token=` works nowhere.
- After 20 refused credentials a minute from one address, the hub answers
  429. A valid credential always passes.
- The page keeps the session on the device and renews it a minute before it
  ends. Signing out ends it at Supabase too.

Settings: `ORBIS_SUPABASE_URL` and `ORBIS_SUPABASE_KEY` (default: the Orbis
project and its publishable key; `ORBIS_SUPABASE_URL=off` turns accounts
off).

### Redirect URLs (for confirmation and reset links)

The confirmation and password-reset emails send people back to the page
they came from. Supabase only redirects to addresses it lists, so in
Supabase → Authentication → URL Configuration:

- **Site URL**: the address you usually open Orbis at, for example
  `http://localhost:7420`.
- **Redirect URLs**: each address you open Orbis at, with `/**`, for example
  `http://localhost:7420/**` or `https://orbis.example.com/**`.

Never add an open wildcard such as `https://**`: a reset link would then
deliver a session to any site.

## Security check

What the local hub does today, acceptable only on a local network, and
how the cloud closes each gap:

1. **One static token opens everything** (including `computer.shell` and
   the secrets). → Accounts, short session tokens, row level security.
2. **The token travels in the address** (`/api/v1/stream?token=`, the
   file content link), so it lands in logs and history. → Done (change
   0064): a one-time stream ticket and an hour-long file key.
3. **Pairing exchanges a 6-digit code for the token.** → Gone in the cloud,
   since signing in replaces it. The local hub already limits it: a code
   dies after 5 wrong tries, and claims stop past 20 a minute.
4. **The vault key sits on the hub's own disk.** → The vault stays only on
   the runner; the cloud never receives a secret, and the export carries
   them encrypted by a password.
5. **`http.fetch`, MCP over HTTP and OAuth discovery fetch any address**
   (SSRF). → Block private, loopback and link-local addresses after the
   name is resolved, and limit redirects.
6. **`computer.shell` and stdio MCP servers run commands.** → Only on each
   person's runner; the cloud hands a runner only its own account's runs
   and never runs a command itself.
7. **Routine webhooks and the OAuth callback.** → Keep their signature and
   `state` checks, and add a rate limit.
8. **No rate limit and no security headers.** → The hub now limits
   refused credentials (change 0064). In the Worker: rate limits
   per address and per account, HSTS, a strict CSP, `X-Frame-Options`,
   CORS closed to its own origin.
9. **Uploads** are already sandboxed (CSP sandbox, `nosniff`). → Add a
   quota per account.
10. **Third-party content** (MCP results, files) already reaches the bots
    marked as untrusted. → Kept.
11. **Runner device tokens.** → Least scope, rotation, revocation from the
    web app, kept encrypted on the phone.

In the cloud as well:

- Supabase: the service role key only in the Worker's secrets, never in
  the web app (which uses the publishable key) nor on a phone.
- Cloudflare: secrets through `wrangler secret`, and Turnstile on sign-up
  and password reset.
- Logs never carry secrets.
- LGPD: export and delete the account. Health data reaches only the bots
  the user picks.
