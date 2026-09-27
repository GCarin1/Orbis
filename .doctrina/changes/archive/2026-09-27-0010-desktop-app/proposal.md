# Change 0010-desktop-app — desktop-app

- **Status:** applied
- **Applied:** 2026-09-27
- **Date:** 2026-09-27
- **Owner:** Claude Code
- **Lane:** product
- **Affects specs:** desktop-app, web-app

## Why

Desktop app: an Electron shell around the web app that finds or starts the local hub, loads it in a hardened window, raises native notifications for approvals and secret requests that focus their conversation, and stays in the tray

product.md delivery step 7 and success criterion SC7 (app mode as well as
web mode); lands ADR 0007.

## What

- `packages/desktop` (`@orbis/desktop`): an Electron main process that
  reads its settings (`hubUrl`, default `http://127.0.0.1:7420`), uses a hub
  that answers `/health` or starts the bundled hub with the system Node.js
  and waits for `/health`, and loads the hub URL (the token handed over in
  the URL fragment, which the web app already captures) in a window with
  context isolation, no Node integration and the sandbox.
- Navigation guard: the window stays on the hub's origin; other http(s)
  links open in the system browser; nothing else loads.
- Notifications: the main process follows the hub's stream and raises one
  native notification per approval request and per new secret request;
  a click shows the window and opens that conversation (the preload's
  `onOpenConversation`, handled by the web app).
- Tray: closing the window hides it; the tray menu opens Orbis, opens the
  settings file, and quits (stopping a hub the app started).
- Tests for the launcher, the notification mapping and the window options;
  `npm run desktop`.
- Docs, CHANGELOG; land ADR 0007.

## Scope boundaries

- No signed installers or auto-update (spec Future); `npm run desktop`
  runs the app from the repository.
- No running bot commands on the user's own machine through the app.

## Verification

- [x] Automated checks pass (`doctrina verify`).
- [x] desktop-app criteria 1–3 cite passing tests (`doctrina coverage`).
- [x] The launcher starts a real hub process and waits for its `/health`.

## Open questions

- None.
