# Spec — computer

**Capability:** computer
**Status:** active
**Implementation:** planned — the workspace used by CLI brains lands with the walking skeleton; tools, providers and live view land in the computer change
**Realizes:** SC3
**Depends on:** bots, tool-gateway, secrets
**Last updated:** 2026-09-27
**Version:** 0.1.0

## Purpose

Every bot gets its own computer: a workspace, a terminal and a browser
profile that no other bot touches, so a bot is a real isolation boundary and
one bot's crash does not stop the others. Computers come from a provider:
`local` (plain directories and processes on the hub host, for development)
or `docker` (one container and one volume per bot with a desktop, Chromium
and noVNC for the live view and takeover). Computers hibernate when idle and
are destroyed with their bot.

## Requirements (EARS)

### Ubiquitous

- The system shall give each bot whose computer is enabled its own workspace directory, terminal and browser profile, none of which is shared with another bot.
- The system shall provide computers through the provider named in the bot's computer configuration or, when it names none, in ORBIS_COMPUTER_PROVIDER: `local` or `docker`.
- The system shall run the docker provider with one container and one named volume per bot, created from the image named in the bot's configuration (default `orbis/desktop:latest`, which carries Xvfb, a window manager, Chromium, x11vnc and noVNC), with the bot's CPU and memory limits applied.
- The system shall execute `computer.shell` with the bot's workspace as working directory, a timeout (default 120 seconds), an output cap of 64 KiB, and an environment that holds none of the hub's variables beyond PATH, HOME, LANG and TERM.
- The system shall confine `computer.read_file`, `computer.write_file` and `computer.list_files` to the bot's workspace after resolving `..` segments and symlinks.
- The system shall drive the browser tools with Playwright on a persistent browser profile stored per bot.
- The system shall publish the bot's screen at three levels: the state ring in the roster, a side panel with the live view (browser screenshots for `local`, noVNC for `docker`) and a full-screen view.

### Event-driven

- When a tool needs a computer that is stopped or hibernated, the system shall start it before executing the tool.
- When a computer has had no tool call for longer than its `hibernateAfter` setting (default 30 minutes), the system shall stop it and keep its workspace or volume.
- When a bot is deleted, the system shall destroy its container, volume, workspace and browser profile.
- When the user takes over a bot's computer, the system shall pause the start of new tool calls for that bot until the user hands control back.
- When a browser tool meets a CAPTCHA, a two-factor prompt or a password field, the system shall return a result that asks the bot to request a takeover from the user.

### Unwanted-behavior (must-not)

- The system shall not let a file tool read or write outside the bot's workspace, whether through `..` segments, absolute paths or symlinks.
- The system shall never attempt to solve or bypass a CAPTCHA or a verification step.

## Acceptance criteria

1. [unverified] With the local provider, `computer.shell` runs in the bot's workspace, a command past its timeout is killed, and the command's environment holds no ORBIS_TOKEN or ORBIS_MASTER_KEY — verified by `packages/hub/test/computer/local.test.ts`.
2. [unverified] File tools refuse `../` paths, absolute paths outside the workspace and symlinks that point outside it — verified by `packages/hub/test/computer/local.test.ts`.
3. [unverified] A bot cannot read a file from another bot's workspace — verified by `packages/hub/test/computer/local.test.ts`.
4. [unverified] The docker provider issues, through a recorded command runner, a create with the CPU and memory limits and the per-bot volume, a start before a tool, a stop after the idle period, and a removal of container and volume on destroy — verified by `packages/hub/test/computer/docker.test.ts`.
5. [unverified] The browser tools open a local page, return its text snapshot, and keep cookies in a per-bot profile across browser restarts — verified by `packages/hub/test/computer/browser.test.ts`.
6. [unverified] A local computer with no tool call for longer than `hibernateAfter` is stopped — verified by `packages/hub/test/computer/local.test.ts`.
7. [unverified] While the user holds a takeover, a tool call of that bot waits until control is handed back — verified by `packages/hub/test/computer/takeover.test.ts`.

## Maturity

**MVP (committed):**

- Local and docker providers, shell, file and browser tools, hibernation, destroy on delete, three-level view, takeover.

**Future (aspirational, not committed):**

- gVisor and Firecracker runtimes through a sandbox SDK.
- Egress allowlists per bot.
- Snapshots of volumes before hibernation.

## Out of scope for this spec

- Secret substitution inside commands (see `specs/secrets`).
