# Tasks — Change 0052-hub-on-the-phone

<!--
Each task is a single checkable item. Keep tasks small (under a few hours
of work). The change is done when every box is checked and
`doctrina close 0052-hub-on-the-phone` succeeds — the close applies the deltas,
archives the change and updates the index, so those are not boxes here.
-->

- [x] Termux script: install (Debian, Node.js, Orbis, Claude Code with fallback), serve with the app's token, stop, status, logs, update, token, setup-token.
- [x] Android: start the hub on this phone through RUN_COMMAND, wait and open it signed in; Termux's result; auto-start; permissions and setup on the first screen.
- [x] Web: start the hub on this phone again when the stream stays down; hints without a computer.
- [x] SC14, ADR 0018 (accounts and a shared database later), spec delta, docs, tests, and a real run under proot.
