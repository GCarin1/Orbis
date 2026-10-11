# Orbis without Termux: the hub on a free server that stays on

The bots need a computer that is on: Claude Code on your plan, the terminal,
the MCP programs and the browser all run there. The Orbis cloud (a
Cloudflare Worker) runs none of this; it only relays the app to your hub
([cloud-migration.md](cloud-migration.md), phase 5).

So instead of the phone running the hub in Termux, a free server runs it,
24 hours a day. The phone becomes just a screen: the Orbis app or any
browser, opened at the cloud's address.

```
phone / browser ──https──▶ Orbis cloud (Cloudflare) ◀──wss── server (Docker: hub, Claude Code, Chromium)
```

The server connects to the cloud by itself, as a device of your account. It
opens no port, and no tunnel is needed (ADR 0025).

## 1. A free server: Oracle Cloud Always Free

1. Create an account at <https://www.oracle.com/cloud/free/>. It asks for a
   card to verify who you are; the Always Free resources cost nothing.
   Choose a home region near you (for example *Brazil East (São Paulo)*).
   It cannot be changed later.
2. **Compute → Instances → Create instance**:
   - Image: **Ubuntu 24.04** (Canonical).
   - Shape: **Ampere → VM.Standard.A1.Flex**, **4 OCPU, 24 GB**. This is the
     whole Always Free allowance; 2 OCPU / 12 GB is plenty too.
   - SSH keys: let it make a pair and **download the private key**, or paste
     your own public key.
   - Boot volume: the default (about 47 GB) is fine; up to 200 GB is free.
3. If it says *Out of capacity*, try another availability domain or try
   again later; A1 capacity comes and goes.
4. Note the instance's **public IP** and connect:
   `ssh -i <the key> ubuntu@<public IP>`

Nothing needs to be opened in the VM's firewall: the hub only connects
outwards.

> Oracle may reclaim an Always Free instance that stays almost idle for
> 7 days. Upgrading the account to **Pay As You Go** (Billing → Upgrade)
> stops that, and the Always Free resources still cost US$ 0.

## 2. Install Orbis on it

On the server:

```
curl -fsSLo orbis-server.sh https://raw.githubusercontent.com/GCarin1/Orbis/HEAD/scripts/server/orbis-server.sh
bash orbis-server.sh install
```

It installs Docker, clones Orbis into `~/orbis` and asks two things:

- **The Orbis cloud's address**: `https://orbis.<you>.workers.dev`, printed
  by the *Cloud* workflow in GitHub Actions.
- **Your Claude plan's token**: run `claude setup-token` on a computer
  signed in to Claude, then paste the `sk-ant-oat…` token. Press Enter to
  skip and paste it later in Settings → Brains → Claude Code.

Both go into `~/orbis/deploy/.env`, readable only by you. Then it builds and
starts the hub; the first build takes a few minutes. Docker restarts the hub
by itself after a reboot.

Then link the server to your account:

```
orbis-server link            # the account's email and password, at prompts
orbis-server status          # … cloud: connected (https://orbis.<you>.workers.dev)
```

## 3. Bring your data from the phone

1. On the phone, in the Orbis app: **Settings → Data → Download my data**,
   with an export password if you want the bots' keys to come along. The
   file lands in Downloads.
2. Copy it to the server, for example from a computer:
   `scp -i <the key> orbis-2026-10-11.orbis ubuntu@<public IP>:`
3. On the server:
   `orbis-server import orbis-2026-10-11.orbis --password`
   (the export's password at the prompt). Importing again doubles nothing.
4. On the phone, leave the account: `orbis-phone unlink` in Termux, or
   **Settings → Account → Your devices → Revoke** on the old phone.
   Only one hub of an account talks to the cloud. If two are linked, the
   one that connected first gives way and says so in `link --status`.
5. In the Orbis app: the connection screen → the cloud's address
   (`https://orbis.<you>.workers.dev`) → sign in with your email and
   password.
6. Termux can now be uninstalled.

## Day to day

| Command | What it does |
|---|---|
| `orbis-server status` | whether the hub runs, its device and the cloud connection |
| `orbis-server logs` (`-f`) | the end of the hub's log |
| `orbis-server update` | pulls the newest Orbis and rebuilds; the data stays |
| `orbis-server stop` / `start` | stops or starts the hub |
| `orbis-server unlink` | leaves the account |
| `orbis-server import F` | brings a `.orbis` file in |

Everything the hub keeps is in the Docker volume `orbis-data` (`/data`):
the database, the vault, the bots' workspaces and Claude Code's sign-in. To
copy it elsewhere, use `docker compose exec orbis node
/app/packages/cli/dist/index.js data export --password -o /data/backup.orbis`,
or Settings → Data in the app.

## Other machines

The same script works on any always-on Ubuntu or Debian machine, arm64 or
x86-64: a home mini PC, a VPS, a Raspberry Pi 5 with 8 GB. Google Cloud's
free e2-micro (1 GB of memory) is too small for Claude Code and Chromium.
