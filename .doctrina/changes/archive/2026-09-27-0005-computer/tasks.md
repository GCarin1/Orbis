# Tasks — Change 0005-computer

- [x] Provider interface, `local` provider (exec, scrubbed env, timeout kill, output cap) and workspace path confinement.
- [x] `docker` provider over an injectable command runner, and the `orbis/desktop` Dockerfile.
- [x] `ComputerManager`: provider per bot, start on demand, hibernation sweep, takeover waits, destroy, `computer.updated`.
- [x] `computer.*` tools and gateway takeover pause; `computer.shell` asks by default.
- [x] `browser.*` tools on Playwright with a per-bot persistent profile; takeover requests for CAPTCHA, 2FA and password pages.
- [x] REST routes: status, start, stop, takeover, release, screenshot, noVNC proxy.
- [x] Tests: local, docker, browser, takeover.
- [x] Web: computer side panel and full-screen view with live screenshot or noVNC, takeover controls.
- [x] Contract, docs, CHANGELOG; land ADR 0005.
