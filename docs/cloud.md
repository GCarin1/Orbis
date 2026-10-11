# Orbis from anywhere, on your Claude subscription

Orbis's hub has to run on a machine that is on. By default that machine is
your computer, and the phone reaches it on the same Wi-Fi
([docs/android.md](android.md)). To use Orbis away from home, with your
computer off, run the hub somewhere else:

| Where | Cost | Good for |
|---|---|---|
| **The phone itself**, inside Termux ([android.md](android.md#orbis-on-this-phone-no-computer)) | free | using it on the phone alone: no computer, no server |
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

See [server.md](server.md): `orbis-server install` on a free Oracle Cloud
VM (or any always-on Ubuntu or Debian machine, arm64 or x86-64) runs the
hub's image (`Dockerfile`) with Caddy in front for HTTPS, and opens the
firewall's ports 80 and 443 only. Two build options of the image:

- `--build-arg BROWSER_PACKAGES=` leaves Chromium out, for a smaller image
  without browser tools.
- `--build-arg CLAUDE_CODE_VERSION=<version>` pins Claude Code.

Everything that must survive an update lives in the `orbis-data` volume
(`/data`): the database, the token, the vault's key, the bots' workspaces,
and Claude Code's sign-in and sessions (`/data/claude`).
