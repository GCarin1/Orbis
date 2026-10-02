# Spec — computer

**Capability:** computer
**Status:** active
**Implementation:** verified — local, host and docker providers (`packages/hub/src/computer/`), browser tools on Playwright (a visible window for host), hibernation, takeover, the live view, the computers setup with the one-click desktop image build, and the `orbis/desktop` image (`docker/desktop/`)
**Realizes:** SC3
**Depends on:** bots, tool-gateway, secrets
**Last updated:** 2026-09-27
**Version:** 0.4.0

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
- The system shall provide computers through the provider named in the bot's computer configuration or, when it names none, in ORBIS_COMPUTER_PROVIDER: `local` (a folder of the bot's own on the hub's machine), `host` (the user's own machine, in a folder they choose) or `docker` (a container with a desktop).
- The system shall run the docker provider with one container and one named volume per bot, created from the image named in the bot's configuration (default `orbis/desktop:latest`, which carries Xvfb, a window manager, Chromium, x11vnc and noVNC), with the bot's CPU and memory limits applied.
- The system shall execute `computer.shell` with the bot's workspace as working directory, a timeout (default 120 seconds) that kills the command's whole process group, an output cap of 64 KiB, and an environment made only of PATH and LANG from the hub, TERM, and HOME set to the bot's own home directory.
- The system shall confine `computer.read_file`, `computer.write_file` and `computer.list_files` to the bot's workspace after resolving `..` segments and symlinks.
- The system shall drive the browser tools with Playwright on a persistent browser profile stored per bot.
- The system shall publish the bot's screen at three levels: the state ring in the roster, a side panel with the live view (browser screenshots for `local`, noVNC for `docker`) and a full-screen view.
- The system shall serve a docker computer's noVNC view only through the hub, to requests that carry the API token or the bot's view cookie, which is scoped to that bot's view path.
- The system shall run a `host` computer's commands in the folder named in the bot's `hostDir` (default the user's home directory) with the user's environment except the hub's variables (`ORBIS_*`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`), confine its file tools to that folder, and open its browser as a visible window — the installed Chrome or Edge when there is one — on a profile of the bot's own.
- The system shall tell a bot in every run which kind of computer it has and where it works, and that a `host` folder holds the user's real files.
- The system shall report, at `GET /api/v1/computers`, what each kind of computer needs on the hub's machine — whether Docker is installed and running, and whether the desktop image exists — and build the desktop image from `docker/desktop/` on request.
- The system shall tell each bot the operating system of its computer and the shell `computer.shell` runs (cmd.exe on Windows), and to prefer the file tools for reading and writing files.

### Event-driven

- When a tool needs a computer that is stopped or hibernated, the system shall start it before executing the tool.
- When a computer has had no tool call for longer than its `hibernateAfter` setting (default 30 minutes), the system shall stop it and keep its workspace or volume.
- When a bot is deleted, the system shall destroy its container, volume, workspace and browser profile.
- When the user takes over a bot's computer, the system shall pause the start of new tool calls for that bot until the user hands control back.
- When a browser tool meets a CAPTCHA, a two-factor prompt or a password field, the system shall return a result that asks the bot to request a takeover from the user.
- When the output of `computer.shell` is longer than the tool result allows, the system shall return its start and its end, say how much was left out, and suggest redirecting it to a file.
- When a bot on a `host` computer writes a file and no rule or grant decides, the system shall ask the user first.
- When the browser of a bot's computer cannot start because Playwright's Chromium is not downloaded, the system shall start the Google Chrome or Microsoft Edge installed on the machine, and when neither is installed, fail naming what to install.

### Unwanted-behavior (must-not)

- The system shall not let a file tool read or write outside the bot's workspace, whether through `..` segments, absolute paths or symlinks.
- The system shall never attempt to solve or bypass a CAPTCHA or a verification step.
- The system shall not accept a `host` folder that is not an absolute path to an existing directory, shall not remove anything of it when the bot is deleted, and shall not carry `host` access in a template, exported or imported.

## Acceptance criteria

1. [verified] With the local provider, `computer.shell` runs in the bot's workspace, a command past its timeout is killed, and the command's environment holds no ORBIS_TOKEN or ORBIS_MASTER_KEY — verified by `packages/hub/test/computer/local.test.ts`.
2. [verified] File tools refuse `../` paths, absolute paths outside the workspace and symlinks that point outside it — verified by `packages/hub/test/computer/local.test.ts`.
3. [verified] A bot cannot read a file from another bot's workspace — verified by `packages/hub/test/computer/local.test.ts`.
4. [verified] The docker provider issues, through a recorded command runner, a create with the CPU and memory limits and the per-bot volume, a start before a tool, a stop after the idle period, and a removal of container and volume on destroy — verified by `packages/hub/test/computer/docker.test.ts`.
5. [verified] The browser tools open a local page, return its text snapshot, and keep cookies in a per-bot profile across browser restarts — verified by `packages/hub/test/computer/browser.test.ts`.
6. [verified] A local computer with no tool call for longer than `hibernateAfter` is stopped — verified by `packages/hub/test/computer/local.test.ts`.
7. [verified] While the user holds a takeover, a tool call of that bot waits until control is handed back — verified by `packages/hub/test/computer/takeover.test.ts`.
8. [verified] Password, CAPTCHA and verification-code pages answer with a request to ask the user for a takeover, and typing into a password field is refused — verified by `packages/hub/test/computer/browser.test.ts`.
9. [verified] The noVNC pages and WebSocket answer only with the bot's own view cookie, and a local computer has no desktop to show — verified by `packages/hub/test/computer/docker.test.ts`.
10. [verified] A host bot's commands run in its folder with the user's variables and without the hub's, file tools read and write there and refuse `..`, writes ask by default, a missing or relative folder is refused, a template carries no host access, the bot is told where it works, deleting it leaves the folder; `GET /computers` reports Docker installed, running or missing and the image, and one call builds it — verified by `packages/hub/test/computer/host.test.ts`.
11. [verified] The context names Windows and cmd.exe on win32 and Linux and /bin/sh on linux; the browser launch falls back from the bundled Chromium to Chrome and Edge, and fails asking to install one — verified by `packages/hub/test/bot-behaviour.test.ts`.

## Maturity

**MVP (committed):**

- Local and docker providers, shell, file and browser tools, hibernation, destroy on delete, three-level view, takeover.

**Future (aspirational, not committed):**

- gVisor and Firecracker runtimes through a sandbox SDK.
- Egress allowlists per bot.
- Snapshots of volumes before hibernation.

## Out of scope for this spec

- Secret substitution inside commands (see `specs/secrets`).
