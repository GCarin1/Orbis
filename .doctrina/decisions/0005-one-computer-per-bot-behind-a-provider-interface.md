# ADR 0005 — One computer per bot behind a provider interface

- **Status:** accepted
- **Scope:** computer, bots, agent-runtimes
- **Date:** 2026-09-27
- **Deciders:** project owner (research: isolation is where Orbis must beat the reference), Claude Code
- **Supersedes:** —
- **Superseded by:** —
- **Evidence:** n/a — no implementation yet; land with the computer change
- **Landed:** 2026-09-27 — `packages/hub/src/computer/provider.ts`, `packages/hub/src/computer/local.ts`, `packages/hub/src/computer/docker.ts`, `packages/hub/test/computer/docker.test.ts`, `docker/desktop/Dockerfile`

## Context

The research names shared computers as the reference product's main weakness:
files, browser sessions and credentials are shared by every bot, one crash
stops all bots, and deleting a bot cleans nothing. Firecracker needs KVM,
which common laptops and CI runners lack; Docker is widely installed;
development and tests need something that runs with neither.

## Decision

Each bot owns one computer — workspace, terminal, browser profile — created
through a provider interface (`ensure`, `exec`, `files`, `browser`,
`status`, `stop`, `destroy`, `view`). Two providers ship: `local`
(per-bot directories and child processes on the hub host; no isolation
beyond paths and environment scrubbing; meant for development and trusted
single-user setups) and `docker` (one container and one volume per bot from
the `orbis/desktop` image with Xvfb, Chromium and noVNC; CPU and memory
limits; stop on idle; remove on delete). gVisor and Firecracker come later as
providers, not as a rewrite.

## Alternatives considered

1. One shared computer per account — rejected: repeats the reference's flaw.
2. Docker only — rejected: tests, CI and users without Docker could not run
   Orbis at all.
3. Adopting an external sandbox service (E2B, a Firecracker manager) now —
   rejected for the MVP: heavy deployment; a provider can wrap it later.

## Consequences

**Positive**

- A bot is an isolation boundary with the docker provider; deletion is real.
- The same tools work on both providers.

**Negative**

- The local provider is not a security boundary; the UI and docs must say
  so and default policies ask before shell commands.
- One desktop container per bot costs memory; hibernation is mandatory.

**Neutral**

- CLI brains run in the workspace of the bot's computer; with the docker
  provider the workspace is the container volume mounted on the host path.
