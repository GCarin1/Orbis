# Orbis from anywhere, on your Claude subscription

Orbis's hub has to run on a machine that is on. By default that machine is
your computer, and the phone reaches it on the same Wi-Fi
([docs/android.md](android.md)). To use Orbis away from home, with your
computer off, run the hub somewhere else:

| Where | Cost | Good for |
|---|---|---|
| **A GitHub Codespace** ([below](#a-github-codespace)) | free monthly hours | trying it: it stops when idle |
| **A server with Docker** ([below](#a-server-that-stays-on)): a free cloud VM, a small VPS, a home server | free to a few dollars a month | every day: routines keep running |

On either one, the `claude-code` bots can run on **your Claude plan (Pro or
Max)** instead of the API, with the token `claude setup-token` prints.

## Claude Code on your plan, not the API

1. On any computer where Claude Code is installed, run this once:

   ```
   claude setup-token
   ```

   Sign in with your Claude account in the page it opens. It prints a token
   that starts with `sk-ant-oat` and lasts **one year**. A Pro, Max, Team or
   Enterprise plan is needed.
2. In Orbis, open **Settings → Brains → Claude Code → 🔑 Subscription
   token**, paste the token and press **Save token**. On a server you can
   set it as the variable `CLAUDE_CODE_OAUTH_TOKEN` instead (in
   `deploy/.env`, or as a Codespaces secret).
3. Press **Test** on the Claude Code card. Every `claude-code` bot now runs
   on the plan.

What Orbis does with the token:

- It keeps the token encrypted with the hub's other secrets. The screen
  shows only that it is saved, when, and until about when it lasts. It never
  shows the token again.
- Only Claude Code gets it, as `CLAUDE_CODE_OAUTH_TOKEN`: in the bots' runs,
  in the brain test and in the account check. The other brains and the bots'
  commands never see it, and it is masked (`••••`) in anything a run stores
  or shows.
- Claude Code never gets `ANTHROPIC_API_KEY` or `ANTHROPIC_AUTH_TOKEN`, even
  when the hub has them. Claude Code would put either one before the token,
  and the run would be billed to the API.
- When the token is saved, Claude Code uses it instead of the sign-in
  (**Sign in** on the same card). Remove the token to go back to the
  sign-in.
- A bot secret named `CLAUDE_CODE_OAUTH_TOKEN` gives that bot another
  account.

The limits are your plan's:

- They come in 5-hour windows and weekly caps.
- They are shared with claude.ai and with Claude Code everywhere else you
  use it. Bots that work a lot (routines, squads, handoffs) spend them
  faster.
- A lighter model per bot spends less. Set it in the bot's settings → Brain
  → model, for example `sonnet` or `haiku`.

**The token is your account.** Use Orbis on it yourself, and do not share
the token, the hub's address or its token. To serve other people, use an API
key, as Anthropic's terms ask.

When the token stops working (after the year, or when it is revoked), a run
fails with "the Claude subscription token was refused". Run
`claude setup-token` again and press **Replace token**.

## A GitHub Codespace

A Codespace is a computer in GitHub's cloud, made from this repository's
`.devcontainer`. Personal GitHub accounts get free hours each month: 120
core-hours, which is 60 hours on the 2-core machine.

1. *(Recommended)* On github.com, open **Settings → Codespaces → Secrets**.
   Add two secrets and give them access to your copy of the Orbis
   repository:
   - `ORBIS_TOKEN`: a long password of yours. The phone asks for it.
   - `CLAUDE_CODE_OAUTH_TOKEN`: the token from `claude setup-token`.
2. On the repository page, open **Code → Codespaces → Create codespace**.
   The first start installs and builds Orbis, which takes a few minutes. The
   hub then starts by itself, and starts again whenever the Codespace starts.
3. The terminal shows the address and the token:

   ```
   Orbis is running: https://<your-codespace>-7420.app.github.dev
   ```

   Run `bash .devcontainer/start.sh` to show them again.
4. On the phone:
   - **Browser:** open the address while signed in to GitHub. The port is
     private, so GitHub checks it is you before Orbis asks for its token.
   - **Android app:** the app cannot sign in to GitHub, so make the port
     public with `bash .devcontainer/start.sh --public`. You can also use the
     PORTS tab: right-click 7420 → Port Visibility → Public. Orbis's token
     still guards every request. Type the address in the app, then pair with
     the code or the QR code from **Settings → Phone**.

Good to know:

- A Codespace stops after the idle timeout: 30 minutes by default, up to 4
  hours in **Settings → Codespaces → Default idle timeout**. While it is
  stopped, Orbis is stopped too. Start it again from
  [github.com/codespaces](https://github.com/codespaces), which also works
  from the phone.
- The data lives in `/workspaces/.orbis-data`: the database, the token, the
  bots' workspaces and Claude Code's sign-in. It is outside the repository
  folder, so it is never committed. It is kept while the Codespace exists
  and deleted with it.
- The bots' browser tools need Chromium, which this container does not
  install. The server image below has it.

## A server that stays on

Use any Linux machine that stays on, x86 or ARM. For example:

- a free cloud VM, such as Oracle Cloud's Always Free ARM VM;
- a small VPS;
- a Raspberry Pi 4 or 5 at home.

The repository's `Dockerfile` builds an image with the hub, the web app,
Claude Code, Chromium (for the browser tools), git, curl and python3. It
runs as a normal user. `deploy/docker-compose.yml` runs the image, and can
put it on the internet through a Cloudflare tunnel without opening any port.

```
curl -fsSL https://get.docker.com | sh       # Docker, when the machine has none
git clone https://github.com/<you>/Orbis.git
cd Orbis/deploy
cp .env.example .env
nano .env                                    # ORBIS_TOKEN and CLAUDE_CODE_OAUTH_TOKEN
docker compose --profile quick-tunnel up -d --build
docker compose logs quick-tunnel | grep -o 'https://[a-z0-9-]*\.trycloudflare\.com'
```

Open the printed `https://….trycloudflare.com` address on the phone, then
type the token or pair with the QR code.

Three ways to reach the server:

| How | Address | Notes |
|---|---|---|
| `--profile quick-tunnel` | `https://<random>.trycloudflare.com` | Free, with no account. The address changes each time the tunnel restarts. Good for trying. |
| `--profile tunnel` | your own domain, which does not change | Create a tunnel in Cloudflare Zero Trust → Networks → Tunnels, point a public hostname at `http://orbis:7420`, and put its token in `TUNNEL_TOKEN`. |
| [Tailscale](https://tailscale.com) | `https://<machine>.<tailnet>.ts.net` | A private network of your own devices, with no public address. Install it on the server and on the phone, then run `tailscale serve --bg 7420` on the server. |

Without a profile, compose publishes the hub on `127.0.0.1:7420` of the
server only.

Everything that must survive an update lives in the `orbis-data` volume
(`/data`). That is the database, the token, the vault's key, the bots'
workspaces, and Claude Code's sign-in and sessions (`/data/claude`).

```
git pull && docker compose up -d --build     # update
docker compose exec orbis cat /data/token    # the hub's token, when ORBIS_TOKEN is empty
docker run --rm -v deploy_orbis-data:/data -v "$PWD":/backup busybox tar czf /backup/orbis-data.tgz /data   # backup
```

Two build options:

- `--build-arg BROWSER_PACKAGES=` leaves Chromium out, for a smaller image
  without browser tools.
- `--build-arg CLAUDE_CODE_VERSION=<version>` pins Claude Code.

## On the internet, safely

- Every API and stream request needs the hub's token. The address alone
  opens only the web app's sign-in screen. Set a long `ORBIS_TOKEN`.
- Pairing codes work once, for five minutes, and die after five wrong
  tries. The hub takes at most 20 tries a minute.
- The vault's master key is kept next to the database in `/data`. Set
  `ORBIS_MASTER_KEY` to keep it somewhere else.
- In the container, the bots' commands run inside the container, never on
  your computer.
- Put tokens only in `deploy/.env` (which git ignores), in Codespaces
  secrets or in Orbis's settings. Never put them in a committed file.
