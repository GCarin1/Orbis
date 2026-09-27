# Change 0005-computer — computer

- **Status:** applied
- **Applied:** 2026-09-27
- **Date:** 2026-09-27
- **Owner:** Claude Code
- **Lane:** product (triage's "runtime" came from the word docker; the spec's requirements are unimplemented)
- **Affects specs:** computer, tool-gateway, web-app

## Why

Computer per bot: local and docker providers behind one interface, computer.shell and file tools confined to the workspace, browser tools with Playwright on a per-bot profile, hibernation after idle, takeover, screenshots and noVNC live view in the web app

product.md delivery step 5 and success criterion SC3 (each bot has its own
computer); lands ADR 0005.

## What

- `computer/`: the provider interface of ADR 0005 (`ensure`, `exec`,
  `status`, `stop`, `destroy`, `view`), the `local` provider (child
  processes in the bot's workspace, scrubbed environment, process-group
  kill on timeout, 64 KiB output cap) and the `docker` provider (one
  container from `orbis/desktop`, one named volume for the home directory,
  the workspace bind-mounted, CPU and memory limits, noVNC and CDP ports
  published on 127.0.0.1) through an injectable command runner.
- `ComputerManager`: provider per bot, start on demand, last-use tracking,
  a hibernation sweep, takeover (tool calls of that bot wait until release),
  destroy on delete, `computer.updated` stream event.
- Tools: `computer.shell` (default ask), `computer.read_file`,
  `computer.write_file`, `computer.list_files` confined to the workspace
  (`..`, absolute paths, symlinks); `browser.open`, `browser.snapshot`,
  `browser.click`, `browser.type`, `browser.press`, `browser.screenshot`,
  `browser.close` on Playwright with a persistent per-bot profile (CDP into
  the container for docker); CAPTCHA, two-factor and password pages answer
  with a request to ask the user for a takeover.
- REST: `GET /bots/:id/computer`, `POST /bots/:id/computer/start|stop|takeover|release`,
  `GET /bots/:id/computer/screenshot`, the noVNC proxy under
  `/bots/:id/computer/vnc/`.
- `docker/desktop/Dockerfile` for `orbis/desktop` (Xvfb, fluxbox, Chromium
  with CDP, x11vnc, noVNC).
- Web: computer side panel (status, start/stop, take over/hand back, live
  screenshot or noVNC) and full-screen view.
- Contract (`ORBIS_BROWSER_EXECUTABLE`, `computer.updated`, routes), docs,
  CHANGELOG; land ADR 0005.

## Scope boundaries

- No gVisor or Firecracker provider, no egress allowlist, no volume
  snapshots (spec Future).
- Secret substitution inside commands arrives with the secrets change.
- The `orbis/desktop` image is provided but not built or run by the test
  suite (no Docker daemon in CI); the docker provider is proven through a
  recorded command runner, as criterion 4 states.

## Verification

- [x] Automated checks pass (`doctrina verify`).
- [x] computer criteria 1–7 cite passing tests (`doctrina coverage`).
- [x] A bot cannot read another bot's files, and a takeover pauses its tool calls.

## Open questions

- None.
