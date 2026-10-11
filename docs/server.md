# Orbis on a free server that stays on (Oracle Cloud)

The bots need a computer that is on: Claude Code on your plan, the terminal,
the MCP programs and the browser all run there. A free Oracle Cloud VM runs
the hub 24 hours a day, and serves the app itself over HTTPS. The phone is
just a screen: the Orbis app or any browser. Termux is not needed (ADR 0026).

```
phone / browser ──https──▶ Caddy (80/443, free certificate) ──▶ hub (127.0.0.1:7420): bots, Claude Code, Chromium
                                                                   └──▶ Supabase: accounts (and a copy of the data)
```

Two pieces only:

- **The VM** runs everything, in Docker.
- **Supabase** keeps the accounts (email, password, two-step verification).

## 1. A free server: Oracle Cloud Always Free

1. Create an account at <https://www.oracle.com/cloud/free/>. It asks for a
   card to verify who you are; the Always Free resources cost nothing.
   Choose a home region near you (for example *Brazil East (São Paulo)*);
   it cannot be changed later.
2. **Compute → Instances → Create instance**:
   - Image: **Ubuntu 24.04** (Canonical).
   - Shape: **Ampere → VM.Standard.A1.Flex**, **4 OCPU, 24 GB** (the whole
     Always Free allowance; 2 OCPU / 12 GB is plenty too).
   - SSH keys: let it make a pair and **download the private key**, or paste
     your own public key.
   - If it says *Out of capacity*, try another availability domain or try
     again later.
3. **Open ports 80 and 443** in the VM's network: the instance → its
   *Subnet* → *Security Lists* → the default list → **Add Ingress Rules**.
   Add source `0.0.0.0/0`, TCP, destination port `80`, and another rule
   with port `443`. Port 22 (SSH) is open already. Nothing else should be
   open.
4. Connect: `ssh -i <the key> ubuntu@<public IP>`

> Oracle may reclaim an Always Free instance that stays almost idle for
> 7 days. Upgrading the account to **Pay As You Go** stops that; the Always
> Free resources still cost US$ 0.

## 2. Install Orbis on it

```
curl -fsSLo orbis-server.sh https://raw.githubusercontent.com/GCarin1/Orbis/HEAD/scripts/server/orbis-server.sh
bash orbis-server.sh install
```

It installs Docker, clones Orbis into `~/orbis`, opens 80 and 443 in the
VM's own firewall, and asks two things:

- **The address**: Enter takes `<your-ip-with-dashes>.sslip.io` (for
  example `203-0-113-7.sslip.io`). It points at your VM with no domain to
  buy. With a domain of your own, type it, after pointing its DNS `A`
  record at the VM's IP.
- **Your Claude plan's token**: run `claude setup-token` on a computer
  signed in to Claude and paste the `sk-ant-oat…` token. Press Enter to skip
  and paste it later in Settings → Brains → Claude Code.

Both go into `~/orbis/deploy/.env`, readable only by you. Then it builds and
starts the hub and Caddy; the first build takes a few minutes. Caddy gets
and renews the HTTPS certificate by itself, and Docker restarts both after a
reboot.

## 3. Sign in, link your account, turn on two-step verification

1. `orbis-server token` prints the hub's token. Open
   `https://<the address>` and sign in with it.
2. **Settings → Account**: sign in to your Orbis account (or create it) and
   **link this hub**. From then on any device opens Orbis with the email and
   password.
3. In Supabase (**Authentication → URL Configuration**), add
   `https://<the address>/**` to the Redirect URLs. Confirmation and
   password links then come back to your Orbis.
4. Sign in with the account on your phone. Then **Settings → Account →
   Two-step verification → Turn on**: scan the QR code with an
   authenticator app (Google Authenticator, Microsoft Authenticator, Authy,
   1Password…) and type its code. From then on every sign-in asks the
   authenticator's code, and a session without it does not open the hub.
5. Keep the hub's token somewhere safe, such as a password manager. It is
   the **recovery key**: it signs in even without the authenticator.

Optional: `orbis-server link` also makes the server a *device* of the
account, which keeps a copy of its data in Supabase.

## 4. Bring your data from the phone

1. On the phone, in the Orbis app: **Settings → Data → Download my data**,
   with an export password if the bots' keys should come along.
2. Copy the file to the server, for example from a computer:
   `scp -i <the key> orbis-2026-10-11.orbis ubuntu@<public IP>:`
3. On the server: `orbis-server import orbis-2026-10-11.orbis --password`.
   Importing again doubles nothing.
4. On the phone: `orbis-phone unlink` in Termux, or **Settings → Account →
   Your devices → Revoke**.
5. In the Orbis app, open the connection screen and enter
   `https://<the address>`, then sign in with your account.
6. Termux can now be uninstalled.

## Day to day

| Command | What it does |
|---|---|
| `orbis-server status` | whether the hub and Caddy run, and its device |
| `orbis-server logs` (`-f`) | the end of the logs |
| `orbis-server update` | pulls the newest Orbis and rebuilds; the data stays |
| `orbis-server token` | the hub's token (the recovery key) |
| `orbis-server import F` | brings a `.orbis` file in |
| `orbis-server stop` / `start` | stops or starts everything |

Everything the hub keeps is in the Docker volume `orbis-data` (`/data`):
the database, the vault, the bots' workspaces and Claude Code's sign-in. For
a copy elsewhere, use Settings → Data → Download my data.

## How it is protected

- **Only 22, 80 and 443 are open.** 80 serves only Caddy's certificate
  check and the redirect to HTTPS. The hub's own port, 7420, listens on the
  VM only.
- **Every request is signed in**: the hub's token, or a session of the
  linked account. A session is a short Supabase token checked against the
  project's published keys; the hub keeps no shared secret.
  - With two-step verification on, a session also needs the
    authenticator's code.
  - The live stream opens with a one-time ticket, and files with a key that
    lasts an hour, so no credential travels in an address.
- **Brute force is cut short.** After 20 refused tries in a minute an
  address must wait. Caddy passes the visitor's real address to the hub,
  which trusts it only from its own machine and private network. Pairing
  codes die after 5 wrong tries or 5 minutes.
- **The browser's protections** are on every answer: HSTS, a CSP that
  allows only Orbis itself and the account's Supabase, `X-Frame-Options:
  DENY`, `nosniff` and `Referrer-Policy: no-referrer`.
- **A hand-picked token is checked.** On the internet the hub refuses an
  `ORBIS_TOKEN` shorter than 24 characters; the one it makes has 43.
- **Keys stay on the VM.** The bots' keys are in the hub's encrypted vault
  under `/data`. Supabase gets neither them nor the device's token, only its
  hash. Each account's rows are closed to every other account by row level
  security. The Supabase key in the app is the *publishable* one, public by
  design; no service key exists anywhere in Orbis.
- **Secrets never go into git.** `deploy/.env` (mode 600) is ignored by
  git, and no file in the repository holds a real key.

Worth turning on in Supabase: **Authentication → Passwords → leaked
password protection** (it checks new passwords against known leaks).

## Other machines

The same script works on any always-on Ubuntu or Debian machine, arm64 or
x86-64: a home mini PC, a VPS, a Raspberry Pi 5 with 8 GB. Google Cloud's
free e2-micro (1 GB of memory) is too small for Claude Code and Chromium.
