# Design — Change 0010-desktop-app

## Approach

Everything that can be decided without Electron lives in plain modules, so
the tests run in Node without a display:

- `hub-launcher.ts`: `ensureHub({ url, dataDir, hubEntry, health, spawn })`
  asks `GET /health`; when nothing answers it spawns `node <hub main.js>`
  with `ORBIS_PORT` and `ORBIS_HOST` taken from the URL, polls `/health`
  until it answers or a timeout passes, and reads the API token from
  `<dataDir>/token`. It returns the URL, the token and the child (to stop
  on quit).
- `window.ts`: the `BrowserWindow` options (context isolation on, Node
  integration off, sandbox on, the preload) and `isAllowedNavigation`,
  which allows only the hub's origin; `guardWebContents` wires it to
  `will-navigate` and `setWindowOpenHandler` (other http(s) links open in
  the system browser, everything else is denied).
- `notifications.ts`: a `NotificationCenter` that turns stream events into
  at most one notification each — `approval.requested`, and a
  `timeline.item` whose card is a pending `secret-request` seen for the
  first time — carrying the conversation to open.
- `stream.ts`: a WebSocket client of `/api/v1/stream` with backoff.

`main.ts` wires them to Electron: single-instance lock, settings in
`userData/settings.json`, the launcher, the window loading
`<hub>/#token=<token>` (the web app moves the token to local storage and
clears the fragment), the tray, and `Notification` clicks that show the
window and send `orbis:open-conversation`. The preload (CommonJS, as
sandboxed preloads require) exposes `orbisDesktop.onOpenConversation`,
`notify` and `settings.get/setHubUrl` — no token, no Node APIs.

## Alternatives considered

1. Exposing the token through the preload — rejected: the spec limits the
   preload to notification and settings functions, and the URL fragment
   already works for `orbis open`.
2. Notifications raised by the web app (Web Notifications API) — rejected:
   they stop when the window is hidden in the tray, which is exactly when
   they matter.
3. Bundling Node.js — rejected for the MVP: the spec says the system
   Node.js runs the bundled hub; installers come later.

## Trade-offs and risks

- The Electron wiring itself (`main.ts`) is not exercised by the automated
  suite (no display in CI); its logic lives in the tested modules.

## Decisions to record as ADRs

- None new: ADR 0007 decides the Electron shell; this change lands it.
