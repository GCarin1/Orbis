# ADR 0027 — Orbis on a home server: one hub per person, each reached only through its own Tailscale node over HTTPS, from a prebuilt image

- **Status:** accepted
- **Scope:** cloud
- **Date:** 2026-10-11
- **Deciders:** project owner (Oracle had no A1 capacity; "tenho uma máquina com o UmbrelOS em casa… 4gb de ram"; "não quero expor nada na internet"; "faça como o Oracle faria… prefiro não fazer gambiarra"; HTTPS through Tailscale; background running and notifications; voice), Claude Code
- **Supersedes:** —
- **Superseded by:** —
- **Evidence:** `deploy/umbrel/docker-compose.yml`, `.github/workflows/server-image.yml`, `docs/umbrel.md`
- **Landed:** 2026-10-11 — `deploy/umbrel/docker-compose.yml`, `.github/workflows/server-image.yml`, `docs/umbrel.md`

## Context

ADR 0026 runs Orbis on an always-on server that serves HTTPS itself. The free Oracle VM had no capacity. The
owner has an UmbrelOS box at home: Docker, 4 GB of DDR3 and 500 GB of disk. They do not want anything exposed
to the internet, but the people of the house must each use their own account, with the bots running in the
background and notifications on the phone. On UmbrelOS, containers outside the App Store go through Portainer
(or Dockge), with named volumes. Plain `docker compose` over SSH is unsupported and can break on an update.

## Decision

- **One hub per person**, the same as on any server.
  - Each person gets their own Portainer stack from `deploy/umbrel/docker-compose.yml`. It has their own
    container, data volume, vault, Claude plan and linked account (with optional two-step verification,
    ADR 0026).
  - The hub stays single-account: bots run commands and keep keys, so people are separated by containers,
    not by rows.
- **Reached only through its own Tailscale node.**
  - Each stack has a `tailscale/tailscale` container (pinned) named `orbis-<name>`. Its Tailscale Serve
    publishes `https://orbis-<name>.<tailnet>.ts.net` (a valid certificate) to `http://orbis:7420` on the
    stack's private network. It never uses Funnel.
  - The hub publishes no port, and nothing is opened on the server or the router.
  - The serve configuration is written from an environment variable, so the stack needs no file of its own.
- **The hub knows its address** (`ORBIS_PUBLIC_URL`, ADR 0026). It trusts the Tailscale container on the
  private network for the visitor's address, and makes its own 43-character token, the recovery key.
- **A prebuilt image.** The *Server image* workflow publishes `ghcr.io/<owner>/orbis:latest` for amd64 and
  arm64, so a small home machine compiles nothing. Each hub is capped (`ORBIS_MEMORY`, 1.5 GB by default) so
  one person cannot starve another; the Tailscale node is capped at 128 MB.
- **Background and notifications.** The hubs run around the clock, restarted by Docker. The Android app's
  existing foreground connection ("Stay connected with the app closed") carries the bots' notifications. The
  phone keeps Tailscale as an always-on VPN. Voice works because the address is HTTPS.

## Alternatives considered

1. One hub shared by every account: the hub would need every table, file, vault entry and workspace scoped
   by account, and bots of one person would run commands next to another's files. It is a large rewrite
   for a weaker separation.
2. Plain HTTP on the house network: no install on the phones, but the browser blocks the microphone, it works
   only at home, and the session travels in clear on the Wi-Fi.
3. Caddy with its own local certificate authority: every device must install and trust that certificate.
4. Building the image on the Umbrel from the repository: slow on 4 GB of DDR3, and repeated on every update.
5. The Umbrel App Store's Tailscale app: one node for the whole Umbrel, whose `serve` cannot be set from the
   app, and which belongs to Umbrel's own app lifecycle.

## Consequences

**Positive**

- Each person of the house has a private Orbis, at home and away, with no port opened anywhere.
- An update is one *Pull and redeploy* in Portainer; the data stays in the stack's volumes.

**Negative**

- Every device that opens Orbis needs Tailscale signed in to the same tailnet (or a share of that machine).
- A home machine is only as available as its power and connection.

**Neutral**

- The first publish of the image is a private package. The owner makes it public once, since it holds no
  secret.
- `docs/server.md` (a VM with Caddy) stays for a machine reachable from the internet.
