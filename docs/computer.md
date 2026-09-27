# Each bot's computer

Every bot owns a computer that no other bot touches: a **workspace**, a
**terminal** and a **browser profile** (ADR 0005,
[`specs/computer`](../.doctrina/specs/computer/spec.md)). A computer starts
the first time a tool needs it, hibernates after 30 minutes without a tool
call (`hibernateAfterMin`), and is destroyed with its bot.

## Providers

| | `local` (default) | `docker` |
|---|---|---|
| Where it runs | directories and child processes on the hub's machine | one container per bot from `orbis/desktop` |
| Isolation | **none beyond paths and a scrubbed environment** — not a security boundary | the container: its own filesystem, processes, CPU and memory limits |
| Browser | headless Chromium on `<data>/bots/<id>/browser-profile` | Chromium on the container's desktop, driven over DevTools |
| Live view | the latest browser screenshot | the desktop over noVNC, with mouse and keyboard |
| Needs | nothing (Playwright's Chromium, or `ORBIS_BROWSER_EXECUTABLE`) | Docker, and the image built once |

Choose per bot (`computer.provider`) or for the whole hub
(`ORBIS_COMPUTER_PROVIDER=docker`). The workspace is always the host folder
`<data>/bots/<id>/workspace`; with docker it is mounted at
`/home/orbis/workspace` in the container, and the rest of `/home/orbis`
(browser profile, desktop settings) lives in the volume `orbis-home-<botId>`.
CLI brains (Claude Code, Codex, Gemini CLI) work in that same folder.

### Building the desktop image

```bash
docker build -t orbis/desktop:latest docker/desktop
```

The image carries Xvfb, fluxbox, Chromium, x11vnc and noVNC. The hub
creates each container with `--cpus` and `--memory` from the bot's settings
(defaults 1 CPU and 2048 MB), publishes noVNC and the DevTools relay on
127.0.0.1 only, stops it after the idle period (the volume stays), and
removes container and volume when the bot is deleted. The automated test
suite checks every docker command the hub issues through a recorded runner;
the image itself is built and run on your machine.

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
