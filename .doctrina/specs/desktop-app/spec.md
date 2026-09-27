# Spec — desktop-app

**Capability:** desktop-app
**Status:** active
**Implementation:** planned — built by the desktop change (product.md delivery order 7)
**Realizes:** SC7
**Depends on:** web-app, hub-api
**Last updated:** 2026-09-27
**Version:** 0.1.0

## Purpose

The app mode: a native desktop window for macOS, Windows and Linux around the
same web app, which finds or starts a local hub, raises native notifications
when a bot needs the user, and stays in the tray while bots keep working.

## Requirements (EARS)

### Ubiquitous

- The desktop app shall be an Electron application that shows the Orbis web app served by the hub in a native window.
- The desktop app shall run its renderer with context isolation on, Node integration off and the sandbox on, exposing through its preload script only notification and settings functions.
- The desktop app shall keep running in the system tray when its window closes, and quit from the tray menu.

### Event-driven

- When the desktop app starts, it shall connect to the hub URL in its settings (default `http://127.0.0.1:7420`) and, when no hub answers `/health` there, start the bundled hub with the system Node.js runtime and wait for `/health`.
- When the stream delivers an `approval.requested` event or a secret-request card, the desktop app shall raise a native notification, and a click on it shall focus the window on that conversation.

### Unwanted-behavior (must-not)

- The desktop app shall not load remote content other than the configured hub URL in its window.

## Acceptance criteria

1. [unverified] The hub launcher uses a hub that answers `/health` and otherwise spawns the bundled hub and waits for `/health` — verified by `packages/desktop/test/hub-launcher.test.ts`.
2. [unverified] An `approval.requested` event and a secret-request card each map to one notification that targets their conversation — verified by `packages/desktop/test/notifications.test.ts`.
3. [unverified] The window options set context isolation on, Node integration off and the sandbox on, and block navigation to other origins — verified by `packages/desktop/test/window.test.ts`.

## Maturity

**MVP (committed):**

- Electron shell, hub discovery and spawn, tray, native notifications, secure renderer.

**Future (aspirational, not committed):**

- Running bot commands on the user's own machine through the desktop app with per-command approval.
- Routing a bot's traffic through the desktop's network.
- Signed installers and auto-update.

## Out of scope for this spec

- Everything the web app renders (see `specs/web-app`).
