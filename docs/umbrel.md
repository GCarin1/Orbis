# Orbis on a home server (UmbrelOS), private through Tailscale

A machine at home that stays on, such as an UmbrelOS box, runs Orbis: the bots, their routines and
notifications, Claude Code and the browser. Termux is not needed, and the phone is just a screen (ADR 0027).
Each person of the house has **their own Orbis**: their own bots, data, keys, Claude plan and account. All of
them are reached through **Tailscale**, a private network of your own devices with a valid HTTPS certificate.
Nothing is opened on the server or on the router.

```
phone / computer ──(Tailscale, HTTPS)──▶ orbis-gabriel.<tailnet>.ts.net ──▶ Gabriel's hub   ┐
phone / computer ──(Tailscale, HTTPS)──▶ orbis-ana.<tailnet>.ts.net     ──▶ Ana's hub       ├ on the Umbrel
                                                    accounts and two-step verification: Supabase ┘
```

Memory: each hub at rest uses a few hundred MB, and Claude Code or Chromium only while a bot works. On a 4 GB
Umbrel two people fit: each hub is capped at 1.5 GB (`ORBIS_MEMORY`) so one cannot starve the other.

## 1. Tailscale (once)

1. Create a free account at <https://login.tailscale.com/start>. It is free for personal use.
2. **DNS** in the admin console: note your **tailnet DNS name**, like `tail1234.ts.net`. Make sure **MagicDNS**
   and **HTTPS Certificates** are enabled.
3. **Settings → Keys → Generate auth key**: reusable is fine, and **not ephemeral**. Copy it (`tskey-auth-…`).
   It is used once per person's Orbis, at its first start.
4. Install Tailscale on every phone and computer that opens Orbis, and sign in with the same account. For
   another person of the house, invite them to the tailnet (admin console → Users → Invite), or share only
   their Orbis machine with them (Machines → … → Share).

## 2. Portainer on the Umbrel (once)

UmbrelOS runs its own apps in Docker; other containers go through Portainer, which is in the Umbrel App
Store. Open the Umbrel dashboard → App Store → **Portainer** → Install, then open it and create its admin
user.

## 3. One Orbis per person

In Portainer: **Stacks → Add stack**:

- **Name**: `orbis-gabriel` (one stack per person).
- **Build method**: *Repository*.
  - **Source**: Portainer 2.45 and later keep the repository as a *GitOps source*. Choose it, or **Create new
    source**:
    - Repository URL `https://github.com/GCarin1/Orbis`;
    - **Authentication off**, because the repository is public;
    - polling off.
  - **Repository reference**: `refs/heads/claude/grok-bot-opensource-clone-i5x5dn`, until it is merged into the
    default branch. This is the branch, not the URL. A URL here fails with *reference not found*.
  - Compose path: `deploy/umbrel/docker-compose.yml`.
  - Without Git: *Web editor* instead, with the contents of
    [`deploy/umbrel/docker-compose.yml`](../deploy/umbrel/docker-compose.yml) pasted in. To update it, open the
    stack's **Editor** and run **Update the stack** with *Re-pull image* on.
- **Environment variables**:

| Name | Value |
|---|---|
| `ORBIS_NAME` | `gabriel`: letters, digits and dashes; it becomes `orbis-gabriel` |
| `ORBIS_TAILNET` | your tailnet DNS name, such as `tail1234.ts.net` |
| `TS_AUTHKEY` | the `tskey-auth-…` key |
| `ORBIS_OWNER_EMAIL` | your Orbis account's email: the hub opens with the account's sign-in, no token to copy |
| `CLAUDE_CODE_OAUTH_TOKEN` | optional: the `sk-ant-oat…` token from `claude setup-token`; or paste it later in Settings → Brains → Claude Code |
| `TZ` | `America/Sao_Paulo` |

**Deploy the stack.** It pulls the ready image `ghcr.io/gcarin1/orbis:latest` for Intel and AMD machines
(amd64), so nothing compiles on the Umbrel. For an ARM machine (a Raspberry Pi, an Umbrel Home), run the
*Server image* Action by hand once with **arm64** ticked. The Orbis machine `orbis-gabriel` appears in the Tailscale admin console.

Repeat for each person with another `ORBIS_NAME`, such as `orbis-ana`. Each stack gets its own volumes, its own
Tailscale machine and its own address.

> If Tailscale shows the machine as `orbis-gabriel-1`, a machine with that name already exists. Remove the old
> one from the admin console and restart the stack.

## 4. First sign-in

1. On a device with Tailscale on, open `https://orbis-gabriel.<tailnet>.ts.net`.
   - With `ORBIS_OWNER_EMAIL` set, sign in with that account's email and password. The first sign-in links the
     hub to the account. Only that account opens it, and its email must be confirmed.
   - Without it, sign in with the hub's token (step 2), then link the account in **Settings → Account**.
   The first visit can take a few seconds while Tailscale issues the certificate.
   - If the browser says the address cannot be found (`DNS_PROBE_…`), first check that Tailscale is connected.
     Then turn off the browser's **secure DNS** (Brave or Chrome → Settings → Privacy and security → Use secure
     DNS): it bypasses Tailscale's MagicDNS, which is what knows the `.ts.net` names.
2. The hub's token is the **recovery key**: it signs in even without the authenticator. Find it in Portainer →
   Containers → `orbis-gabriel-orbis-1` → **Console** → Connect, then run `cat /data/token`. Keep it in a
   password manager.
3. Signed in with the token: **Settings → Account**, sign in to your Orbis account (or create it) and **link
   this hub**. From then on you sign in with your email and password.
4. Turn on **two-step verification** there (an authenticator app's code). Then a password alone does not
   open your Orbis.
5. In Supabase, **Authentication → URL Configuration**: add `https://orbis-gabriel.<tailnet>.ts.net/**` (and
   each person's address) to the Redirect URLs. Then confirmation and password links come back to Orbis.

## 5. On the phone: the app, notifications in the background, voice

1. Tailscale app: signed in. On Android, turn on **Always-on VPN** for Tailscale (Android Settings → Network →
   VPN → Tailscale → ⚙ → Always-on VPN). Then the phone reaches your Orbis all the time, at home or away.
2. Orbis app: on the connection screen, enter `https://orbis-gabriel.<tailnet>.ts.net` and sign in.
3. **Settings → Phone**:
   - allow **Notifications**;
   - keep **Stay connected with the app closed** on.

   The bots keep working on the Umbrel with the phone off. With the app closed you still get their replies,
   approvals and reports as notifications.
4. **Voice** works: the address is HTTPS with a valid certificate, so the microphone is allowed.

## 6. Bring your data from the phone

On the phone (the old Orbis in Termux): **Settings → Data → Download my data**, with a password for the bots'
keys. Then in the new Orbis: **Settings → Data → Import a .orbis file**. Afterwards Termux can be uninstalled.

## Day to day

- **Updates**: Portainer → Stacks → `orbis-gabriel` → **Pull and redeploy**. The data stays in the stack's
  volumes.
- **Backups**: Settings → Data → Download my data. Or Portainer → Volumes → `orbis-gabriel_orbis-data`.
- **Logs**: Portainer → Containers → `orbis-gabriel-orbis-1` → Logs.

## How it is protected

- **Nothing is open to the internet**, and nothing on the router. Each hub has no published port: only its own
  Tailscale machine reaches it, on its stack's private network. Only devices of your tailnet reach that
  machine, and Tailscale Serve keeps it private (never Funnel).
- **Every request is signed in**: the hub's token, or the linked account's session. With two-step verification
  on, the session also needs the authenticator's code. 20 refused tries a minute make that address wait.
- **Each person is separate**: their own container, volume, vault and Claude plan. A person's bots and their
  commands never touch another person's files.
- **The keys stay at home**: the bots' keys live in the hub's encrypted vault on the Umbrel. Supabase keeps
  only the accounts (and, if a hub is linked as a device, a copy of its data, never a secret), each one closed
  to the others by row level security.
- **The Tailscale auth key** is used once at the first start. Afterwards the machine keeps its own identity
  in the `tailscale-state` volume. Revoke or expire the key in the admin console when all stacks are up.
