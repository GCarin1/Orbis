# Design — Change 0005-computer

## Approach

A `ComputerProvider` owns the machine side of a bot's computer: `ensure`
(start or create), `exec` (run a shell command in the workspace), `status`,
`stop` (hibernate: keep the disk), `destroy` and `view` (how to show the
screen). The `ComputerManager` picks the provider per bot
(`bot.computer.provider`, else `ORBIS_COMPUTER_PROVIDER`), starts a computer
before a tool needs it, records the last tool call, and a sweep stops
computers idle past `hibernateAfterMin`. Everything the tools touch goes
through the manager, so hibernation, takeover and destroy see every use.

The workspace is always a host directory (`<data>/bots/<id>/workspace`):
the `local` provider runs commands there directly, the `docker` provider
bind-mounts it at `/home/orbis/workspace` and keeps the rest of the home
directory (browser profile, desktop settings) in a named volume
`orbis-home-<botId>`. File tools therefore run on the host for both
providers, with one confinement function: resolve the path against the
workspace, refuse anything outside it, then resolve symlinks
(`realpath` of the target, or of its nearest existing parent for a new
file) and refuse again if the real path leaves the workspace.

The browser is Playwright (`playwright-core`). With `local`, the hub launches
a persistent Chromium context on `<data>/bots/<id>/browser-profile`
(headless; `ORBIS_BROWSER_EXECUTABLE` or Playwright's own browser). With
`docker`, the image runs Chromium with a CDP port that the provider publishes
on 127.0.0.1, and the hub attaches over CDP — the same page the user sees in
noVNC. Pages are summarised for the model as text snapshots (title, URL,
visible text, links, form fields with stable references) inside the
`<untrusted-content>` envelope. After each browser action the hub keeps the
latest screenshot for the live view.

Takeover is a per-bot gate in the manager. The gateway awaits
`computer.waitForControl(bot)` before every tool call of that bot (not only
computer tools: the user is driving), marks the run `waiting` meanwhile, and
continues when the user hands control back or the run is cancelled.

## Alternatives considered

1. A per-bot Linux user on the host for the local provider — rejected:
   needs root and is still not a boundary; the docker provider is the
   isolation story (ADR 0005).
2. Running the file tools through `docker exec` — rejected: two code paths
   for one rule; the bind-mounted workspace keeps one confinement function.
3. Playwright inside the container driven by a sidecar — rejected: CDP from
   the hub needs no extra process and keeps one browser implementation.
4. A generic HTTP proxy dependency for noVNC — rejected: the proxy is two
   small handlers (static files and one WebSocket pipe) on what the hub
   already has.

## Trade-offs and risks

- The local provider is not a security boundary (documented; `computer.shell`
  asks by default).
- Symlink checks race with a command that swaps a link between check and
  use; the local provider accepts that (same user), the docker provider
  confines by construction.
- CAPTCHA/2FA detection is heuristic (password fields, known CAPTCHA
  frames, verification-code wording); a miss only means the bot sees the
  page and, by its instructions, must not solve it.
- The desktop image is not exercised by the automated suite.

## Decisions to record as ADRs

- None new: ADR 0005 already decides the provider interface; this change
  lands it.
