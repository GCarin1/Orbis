# The desktop app

The app mode of Orbis is an Electron shell around the same web app
([`specs/desktop-app`](../.doctrina/specs/desktop-app/spec.md), ADR 0007):
a native window on macOS, Windows and Linux that finds or starts your hub,
raises native notifications when a bot needs you, and stays in the tray
while bots keep working.

```bash
npm install          # downloads Electron's binary for your platform
npm run desktop      # builds everything and opens the app
```

## What it does

- **Hub.** It reads `hubUrl` from its settings file (default
  `http://127.0.0.1:7420`; the tray menu opens the file). When a hub answers
  `/health` there, it uses it; otherwise, for a local address, it starts the
  bundled hub with your Node.js (`node`, or `ORBIS_NODE`) on that address and
  waits until it answers. A hub the app started stops when the app quits.
- **Sign-in.** For a hub on this machine the app reads the token from
  `~/.orbis/token` (`ORBIS_DATA_DIR`) and hands it to the web app in the
  URL fragment; for a remote hub the web app asks for it once.
- **Security.** The window runs with context isolation, no Node
  integration and the sandbox. It never leaves the hub's address: links to
  other sites open in your browser, and nothing else loads. The preload
  exposes only notification and settings functions.
- **Notifications.** An approval request or a new secret request raises one
  native notification; clicking it shows the window on that conversation.
- **Tray.** Closing the window hides it; **Quit Orbis** in the tray menu
  quits.

Signed installers and auto-update are not part of this version; run the app
from the repository.
