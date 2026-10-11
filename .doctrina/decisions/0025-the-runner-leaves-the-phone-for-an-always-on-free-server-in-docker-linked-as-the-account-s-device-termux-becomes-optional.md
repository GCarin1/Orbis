# ADR 0025 — The runner leaves the phone for an always-on free server in Docker, linked as the account's device; Termux becomes optional

- **Status:** accepted
- **Scope:** cloud, cli
- **Date:** 2026-10-11
- **Deciders:** project owner ("A ideia é não precisar mais [do Termux]"; chose a free VM), Claude Code
- **Supersedes:** —
- **Superseded by:** —
- **Evidence:** `scripts/server/orbis-server.sh`, `deploy/docker-compose.yml`, `packages/cli/src/commands/data.ts`, `packages/hub/src/relay/client.ts`, `docs/server.md`
- **Landed:** 2026-10-11 — `scripts/server/orbis-server.sh`, `packages/cli/src/commands/data.ts`, `packages/hub/src/relay/client.ts`

## Context

The bots need a computer that is on. Claude Code runs on the user's plan,
and the terminal, the MCP programs and the browser run there too. The Orbis
cloud (ADR 0024) runs none of this; it relays the app to the account's hub.
Until now that hub ran on the phone in Termux (ADR 0018). The user wants to
stop depending on Termux, at no cost. Cloudflare Containers are not on the
free plan. The repository already builds a server image (`Dockerfile`,
`deploy/docker-compose.yml`).

## Decision

- **The runner is a server that stays on.** By default it is Oracle Cloud's
  Always Free Ampere VM (arm64, up to 4 OCPU / 24 GB, US$ 0), running the
  existing image with Docker.
  - It links to the account as a device (ADR 0023). It reaches the cloud
    with the relay (ADR 0024), outwards only: no port, no tunnel.
  - The phone is only a screen: the Orbis app, already able to open a
    remote address, or a browser.
  - Termux stays supported but optional.
- **`orbis-server`** (`scripts/server/orbis-server.sh`) runs every step on
  the server: `install` (Docker from its official installer, the checkout,
  a private `deploy/.env` with the cloud's address and the Claude plan's
  token, the hub up), `link`, `unlink`, `import`, `status`, `logs`,
  `update`, `stop` and `start`.
- **Data moves as a file, straight to the hub.** `orbis data export|import`
  carries a `.orbis` file (ADR 0022) to the server's hub without the cloud,
  whose relay takes at most 30 MB a body. The export's password is typed at
  a hidden prompt or piped on stdin, never passed as an argument.
- **One hub per account, without a tug of war.** A hub replaced by a newer
  one of the same account (close 4409) gives way for good. It says so and
  does not try again until it is unlinked and linked again, given another
  cloud, or restarted. Before this, a phone and a server would take the
  relay from each other every five minutes.
- **The image builds for both machines.** The *Server image* workflow
  builds `linux/arm64` and `linux/amd64` without publishing.

## Alternatives considered

1. Cloudflare Containers: US$ 5 a month, and the container's disk is lost
   on every restart. The hub would have to restore its database and vault
   from the account each time.
2. Rewriting the run engine for the cloud with API brains only: it loses
   Claude Code on the plan, the terminal, MCP programs and the browser.
3. Google Cloud's free e2-micro: 1 GB of memory is too little for Claude
   Code and Chromium.
4. The user's own computer: free, but it works only while the computer is
   on.

## Consequences

**Positive**

- The bots work 24 hours a day with the phone off or without Termux.
- Setting up is one command, `orbis-server install`, plus `link`.

**Negative**

- Oracle needs a card to verify the account, and may reclaim an idle Always
  Free instance unless the account is upgraded to Pay As You Go (still free
  within the allowance).
- The server holds the bots' keys in its vault. Its security is the user's
  VM's: SSH keys only, and no port opened.

**Neutral**

- Health Connect data still comes from the Android app (ADR 0019), through
  the cloud to the server's hub.
