# Each bot's computer

Every bot owns a computer that no other bot touches: a **workspace**, a
**terminal** and a **browser profile** (ADR 0005,
[`specs/computer`](../.doctrina/specs/computer/spec.md)). A computer starts
the first time a tool needs it, hibernates after 30 minutes without a tool
call (`hibernateAfterMin`), and is destroyed with its bot.

## Three kinds of computer

Pick one per bot in **⚙ Bot settings → Computer** (three cards), or for the
whole hub with `ORBIS_COMPUTER_PROVIDER=local|host|docker`.
**Settings → Computers** shows what each kind needs on this machine.

| | 📁 Private folder (`local`, default) | 💻 My computer (`host`) | 🐳 Container (`docker`) |
|---|---|---|---|
| Where it works | a folder of its own, `<data>/bots/<id>/workspace`, on the machine that runs Orbis | **your own machine**, in the folder you choose (default: your home folder) | its own Linux container from `orbis/desktop` |
| Commands | in its folder, with only PATH, LANG, TERM and its own HOME | in your folder, with your programs, your git and your environment — minus Orbis's own variables (`ORBIS_*`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`) | inside the container |
| Files | confined to its folder | confined to your folder (a `..`, an absolute path or a symlink out of it is refused) | its folder, mounted at `/home/orbis/workspace` |
| Browser | Chromium without a window, on its own profile | **a window on your screen** — your Chrome, else Edge, else Playwright's Chromium — on its own profile | Chromium on the container's desktop |
| Live view and takeover | the latest screenshot; taking over only pauses it | the window itself: click and type in it, then hand back | the desktop over noVNC, with mouse and keyboard |
| Isolation | **none beyond paths and a scrubbed environment** | **none**: it is your computer (ADR 0009) | the container: own files, processes, CPU and memory limits |
| Asks before | commands | commands **and file writes** | commands |
| Needs | nothing | your consent, once per bot | Docker, and the image prepared once |

CLI brains (Claude Code, Codex, Gemini CLI, Cursor) work in the same folder
as the bot's tools: its workspace, or the folder you chose on your machine.

### My computer

Choose **My computer**, type the full path of the folder it may work in
(for example `C:\Users\you\Projects\site`), tick the box that says what
the bot will be able to do, and save. The bot is told in every run that it
works on your real files and must not delete what it did not create unless
you ask. Deleting the bot never touches that folder. A bot exported as a
template never carries this access: whoever imports it decides again.

On a Linux server without a screen the browser runs without a window.

### The container and its image

The container needs Docker Desktop (Windows, macOS) or Docker Engine
(Linux) and the `orbis/desktop` image. In **Settings → Computers** (or under
the Container card of a bot) Orbis says whether Docker is installed and
running and whether the image exists, and **Prepare image** builds it — a
few minutes and about 1 GB the first time. By hand:

```bash
docker build -t orbis/desktop:latest docker/desktop
```

The image carries Xvfb, fluxbox, Chromium, x11vnc and noVNC. The hub
creates each container with `--cpus` and `--memory` from the bot's settings
(defaults 1 CPU and 2048 MB), publishes noVNC and the DevTools relay on
127.0.0.1 only, stops it after the idle period (the volume
`orbis-home-<botId>` with its browser profile stays), and removes container
and volume when the bot is deleted. The automated test suite checks every
docker command the hub issues through a recorded runner; the image itself is
built and run on your machine.

## Tools

| Tool | What it does | Default |
|------|--------------|---------|
| `computer.shell` | runs a command in the workspace; timeout 120 s (kills the whole process group), output cap 64 KiB; long output comes back as its start and end | **ask** |
| `computer.read_file` / `computer.write_file` / `computer.list_files` | files inside the workspace only — `..`, outside absolute paths and symlinks that lead out are refused | allow |
| `browser.open` | opens an http(s) page and returns a text snapshot with references (`l1` links, `f1` fields, `b1` buttons) | allow |
| `browser.click` / `browser.type` / `browser.press` | act on the page by reference, selector or visible text; return the new snapshot | allow |
| `browser.snapshot` / `browser.screenshot` / `browser.close` | read the page again, save a PNG in `screenshots/`, close the browser (cookies stay in the profile) | allow |

The command environment holds only `PATH` and `LANG` from the hub, `TERM`,
and `HOME` set to the bot's own home directory — never the Orbis token, the
master key or an API key. Page content reaches the model inside
`<untrusted-content>`.

Change any default with the bot's policy (for example allow `computer.shell`
for a trusted bot, or ask before `browser.*`), see
[approvals.md](approvals.md).

## Takeover

When a page asks for a password, a CAPTCHA or a verification code, the
browser tools say so and tell the bot to ask you to take over; a bot never
types a password and never tries to solve or bypass a CAPTCHA.

In the web app, open **🖥 Computer** in the bot's conversation:

- **Take over** — the bot's tool calls wait (its run shows *Waiting for
  you*) until you press **Hand back**. With `docker` you drive the desktop in
  the noVNC view; with `local` the browser has no screen, so taking over only
  pauses the bot.
- **Start / Stop**, **Full screen**, and the live view (the page the bot is
  on, refreshed after each of its browser actions).

The same actions exist in the API: `POST /api/v1/bots/:id/computer/start|stop|takeover|release`,
`GET /api/v1/bots/:id/computer` and `GET /api/v1/bots/:id/computer/screenshot`
([api.md](api.md)).
