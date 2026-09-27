# Spec Delta — capability: desktop-app

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/desktop-app/spec.md`

---

```ops
set-header Implementation: verified — Electron shell in `packages/desktop` (hub launcher, hardened window, notifications, tray); run with `npm run desktop`
bump-version minor
append-requirement ubiquitous: The desktop app shall hand the local hub's API token to the web app in the URL fragment of the page it loads, and shall expose no token through its preload.
append-requirement event: When a started hub process exits or does not answer `/health` within the timeout, the desktop app shall report why and quit, and it shall stop a hub it started when it quits.
set-criterion 1: verified
set-criterion 2: verified
set-criterion 3: verified
```
