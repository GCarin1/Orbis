# ADR 0007 — One web app for browser and desktop with an Electron shell

- **Status:** accepted
- **Scope:** web-app, desktop-app, hub-api
- **Date:** 2026-09-27
- **Deciders:** project owner (requirement: "modo app e modo web"), Claude Code
- **Supersedes:** —
- **Superseded by:** —
- **Evidence:** n/a — no implementation yet; land with the desktop change
- **Landed:** —

## Context

The owner wants an app mode and a web mode. Maintaining two user interfaces
doubles the work. The hub already has to serve an API; it can serve the built
web app from the same port. A desktop app adds native notifications, a tray
and "start the hub for me", which a browser tab cannot do.

## Decision

The web app (React + Vite) is built once and served by the hub at `/`. The
desktop app is an Electron shell that finds or spawns a local hub, loads the
hub's URL in a hardened window, and adds native notifications and a tray.
The web app is also a PWA so phones can install it until native mobile apps
exist.

## Alternatives considered

1. Tauri — rejected for now: smaller binaries, but a Rust toolchain for every
   contributor and platform-specific webviews to test.
2. A separate native UI — rejected: two front-ends to keep in sync.
3. Web only — rejected: the owner asked for an app mode.

## Consequences

**Positive**

- One UI codebase; every feature lands in browser and desktop at once.

**Negative**

- Electron installers are large (about 100 MB).

**Neutral**

- The desktop app needs Node.js 22 on the machine to spawn the hub, which
  users of the agent CLIs already have.
