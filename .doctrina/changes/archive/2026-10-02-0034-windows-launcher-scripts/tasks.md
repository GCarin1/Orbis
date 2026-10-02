# Tasks — Change 0034-windows-launcher-scripts

<!--
Each task is a single checkable item. Keep tasks small (under a few hours
of work). The change is done when every box is checked and
`doctrina close 0034-windows-launcher-scripts` succeeds — the close applies the deltas,
archives the change and updates the index, so those are not boxes here.
-->

- [x] Icon: `scripts/ico.mjs`, `scripts/make-ico.mjs`, `docs/brand/orbis.ico`, `npm run brand:ico`.
- [x] Launcher: `orbis-launcher.mjs` and `Orbis.bat` (start, restart, refuse a foreign program, keep the old Orbis on a failed build).
- [x] Token and shortcuts: `token.mjs`, `Orbis-Token.bat`, `criar-atalhos.ps1`, `Orbis-Atalhos.bat`, `.gitattributes`.
- [x] Tests: `packages/cli/test/windows-launcher.test.ts`.
- [x] Docs: `docs/windows.md`, READMEs, CHANGELOG.
