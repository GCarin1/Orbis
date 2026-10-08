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
3. **Export and import** (change 0065, done) — see
   [Moving your data](#moving-your-data-phase-3).
4. **The phone linked to the account** (change 0066, done) — see
   [Linking the phone to your account](#linking-the-phone-to-your-account-phase-4).
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

## Moving your data (phase 3)

Updating Orbis keeps everything where it is, on your hub: nothing needs an
account. To bring your data elsewhere (a new phone, your cloud account),
use **Settings → Data**.

1. **Download my data.** Type a file password twice (at least 10
   characters) to bring the bots' keys and tokens along, sealed by it. Or
   untick it, and the file holds no key. Keep the password: nobody can
   recover it. The file `orbis-<date>.orbis` goes to the browser's
   downloads, or to the phone's Downloads in the Android app.
2. **Import a .orbis file**, choosing where it goes:
   - **Into this hub** — everything, and the keys with the file's password.
   - **Into my cloud account** — sign in to the account. The bots,
     conversations, memory, routines and the rest go in. The keys never go
     to the cloud: they stay in the file for your phone's hub.

What is already there stays as it is: importing the same file again adds
nothing. The report shows, per kind of data, what came in and what was
already there.

What the file holds (ADR 0022):

- `manifest.json`: the format, the counts, and the SHA-256 of every part.
  A changed, missing or extra part stops the import.
- One JSON Lines part per table.
- The conversations' files and the skills.
- Only with a password, `secrets.sealed.json` (scrypt + AES-256-GCM).

What does not travel:

- The vault itself.
- MCP sign-ins with an account (OAuth): sign in again.
- The CLI sessions.
- The account linked to the old hub.
- A bot's "my computer" consent: it works in its own isolated computer
  until you give it the new machine.
- Runs still working arrive cancelled, and pending approvals expire.

Until the cloud's file storage opens (phase 5), the files' contents and the
skills stay in the file and on the hub: keep the `.orbis` file.

## Linking the phone to your account (phase 4)

On the phone, in Termux:

```
orbis-phone link
```

Or, in the app, use **Settings → Account → This hub in your account**.

Type the account's email and password once. The hub becomes a **device**
of the account. From then on it sends what changes (bots, conversations,
memory, routines, health and the rest) to the account on its own, every
15 seconds while it is on. The bots' keys never leave the phone.

- `orbis-phone link --status`: what is waiting and when it last sent.
  `--sync` sends now.
- `orbis-phone unlink`: leaves the account. The device's token stops
  working, and the data already in the account stays.
- **Your devices** (Settings → Account): every hub linked to the account.
  **Revoke** cuts one off at once, for example a lost phone.

How it is protected (ADR 0023):

- The device gets a token of its own (32 random bytes). The phone keeps it
  in its vault; the cloud keeps only its SHA-256. The password and the
  session are not kept.
- The token opens only one door, `device_sync`:
  - it writes the device's rows under its owner and nowhere else;
  - it takes only the synced tables, and at most 500 rows a call;
  - it reads nothing back.
- A revoked token stops at once. The phone then sends nothing more and
  forgets it.
- At most 10 active devices per account.
- Only the hub's own token links or unlinks it, never a session that
  opened it.

This phase goes from the phone to the cloud. Messages typed in the cloud's
app reach the phone with phase 5.

The cloud's functions are in `supabase/migrations/0002_devices.sql`.

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
   them sealed by the user's password (change 0065, done).
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
11. **Runner device tokens.** → Least scope (one function, only the owner's
    rows), revocation from the web app, kept encrypted on the phone, only a
    hash in the cloud (change 0066, done).

In the cloud as well:

- Supabase: the service role key only in the Worker's secrets, never in
  the web app (which uses the publishable key) nor on a phone.
- Cloudflare: secrets through `wrangler secret`, and Turnstile on sign-up
  and password reset.
- Logs never carry secrets.
- LGPD: export and delete the account. Health data reaches only the bots
  the user picks.
