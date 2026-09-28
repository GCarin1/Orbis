# Design — Change 0017-computer-modes

## Approach

The provider interface of ADR 0005 already separates what a computer is from
the tools that use it; `host` is a third provider next to `local` and
`docker`. The one thing that changes shape is *where the bot works*: for
`local` and `docker` it is the bot's workspace under the data directory,
for `host` it is a folder of the user's machine. `ComputerManager.workDir(bot)`
answers that for the file tools, the shell and the CLI brains (whose working
directory is the same folder), while the bot's own directory keeps its
browser profile, screenshots and downloads.

`host` runs `computer.shell` with the user's environment minus the hub's
variables, so their PATH, git configuration and tools are there; file tools
stay confined to the chosen folder; the browser launches visible, trying the
installed Chrome, then Edge (always present on Windows), then Playwright's
Chromium — and headless on a Linux server without a display. Tools may now
declare their default decision per bot: `computer.write_file` asks on `host`.

For `docker`, `ComputerSetup` answers what the machine has (`docker version`,
`docker image inspect`) and builds `orbis/desktop` from `docker/desktop/` in
the background; the web app polls while it builds.

## Alternatives considered

- A native folder picker: the web app runs in a browser, where paths are not
  exposed; a typed full path with the home folder as placeholder works in
  both the browser and the desktop app.
- Pulling a published image: there is no registry image yet; building from
  the Dockerfile in the repository needs nothing else.

## Trade-offs and risks

- `host` is not a boundary (ADR 0009); consent, `ask` defaults and the
  bot's context make it deliberate rather than safe.
- The image build takes minutes and about a gigabyte; the button says so.
- Building needs the repository's `docker/desktop/`; an install without it
  gets the manual command instead of the button.

## Decisions to record as ADRs

- ADR 0009 — A bot may work on the user's own machine by explicit per-bot consent.
