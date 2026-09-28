# Change 0017-computer-modes — Computer modes

- **Status:** applied
- **Applied:** 2026-09-28
- **Date:** 2026-09-28
- **Owner:** Claude Code
- **Lane:** product (confident; signals: feature)
- **Affects specs:** computer, web-app, templates

## Why

The project owner asked whether "the chief of staff's screen" is really a bot
using a virtual machine or a container image, and wants more than one
option: bots that use their own machine, or that use a simple image with the
tools they need. Orbis had a `local` folder and a `docker` container, chosen
with a bare select and no way to prepare the container image.

## What

- Hub: `computer/host.ts` (the `host` provider), `computer/setup.ts`
  (`GET /api/v1/computers`, `POST /api/v1/computers/docker/image`),
  `ComputerManager.workDir` and `contextSection`, the visible browser for
  `host`, per-bot default decisions (`computer.write_file` asks on `host`),
  `computer.hostDir` in the bot schema, templates without host access.
- Web: `ComputerModes.tsx` (three cards, folder, consent, Docker state and
  image button, the Computers settings tab), bot settings, bot panel,
  computer panel notes.
- ADR 0009.
- Tests: hub `computer/host`, web `computers`, e2e `computer-modes`; the
  configuration test names the third provider.
- Docs: `docs/computer.md`, `docs/api.md`, READMEs, CHANGELOG, contract
  hub-surface, `.env.example`.

## Scope boundaries

- No virtual machines (Hyper-V, VirtualBox): the container is the isolated
  option; a VM provider can come later behind the same interface.
- No published registry image; the hub builds `orbis/desktop` locally.
- The bot's own browser profile is used even on `host`; the user's everyday
  browser profile is never driven.

## Verification

<!--
How you will know the change is correctly applied. Use checkboxes: every
box here is a claim that must be PROVEN before the change is done.
`doctrina change archive` refuses to archive while any box below is
unchecked (pass --force to archive anyway and record the gap). Distinguish
"task marked done" from "verification passed" — link the evidence.
-->

- [x] Automated checks pass (`doctrina verify`), including the new hub, web and end-to-end tests.
- [x] The affected specs' acceptance criteria cite their evidence (`doctrina coverage --strict`).
- [x] In a real browser, a bot given the user's folder asks before writing and the file lands there (`tests/e2e/computer-modes.test.ts`).
- [x] The image build was exercised against a recorded Docker; no Docker daemon was available to build `orbis/desktop` for real in this environment.

## Open questions

- None.
