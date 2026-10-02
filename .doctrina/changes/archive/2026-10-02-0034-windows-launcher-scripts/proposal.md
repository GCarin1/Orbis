# Change 0034-windows-launcher-scripts — windows launcher scripts

- **Status:** applied
- **Applied:** 2026-10-02
- **Date:** 2026-10-02
- **Owner:** Claude Code
- **Lane:** product (confident; signals: feature)
- **Affects specs:** cli
- **Documented surface:** n/a — documented in docs/windows.md and the READMEs with this change
## Why

The project owner runs the hub by hand in a terminal on Windows, and after a pull
and a build the running hub keeps the old code until it is stopped and started
again. They asked for a `.bat` that starts Orbis with the Orbis icon and, when
Orbis is already running, restarts it; and another `.bat` that makes the token
of the first login.

## What

- `scripts/windows/Orbis.bat` over `orbis-launcher.mjs`: build, find an Orbis hub
  on the port (`/health`, then the owner of the port from `netstat -ano`, which
  does not depend on the language of Windows), stop it with its tree
  (`taskkill /T`), start `orbis serve` in the window, open the web app signed in.
  The logic is in Node so it is tested on any system; the `.bat` only finds Node.
- `Orbis-Token.bat` over `token.mjs`: the hub's own token file and format,
  clipboard, signed-in address, `--novo` to replace.
- `Orbis-Atalhos.bat` over `criar-atalhos.ps1`: shortcuts with the icon, because
  a `.bat` cannot carry one. `docs/brand/orbis.ico` is made from the brand's SVG
  by `scripts/make-ico.mjs` (`npm run brand:ico`).
- `.gitattributes`: `.bat` and `.ps1` are checked out with CRLF.
- Tests: `packages/cli/test/windows-launcher.test.ts` (two real launchers on a free
  port). Docs: `docs/windows.md`, both READMEs, CHANGELOG.

## Scope boundaries

- The scripts do not touch the hub's code, API or the desktop app.
- The Windows-only commands (`netstat`, `tasklist`, `taskkill`, `clip`, the
  shortcut COM object) are exercised only through their parsers and the argument
  lists; the restart itself is proven on POSIX with the same launcher.

## Verification

- [x] Automated checks pass: `npm run typecheck`, every Vitest project and `npm run build`.
- [x] The affected spec's acceptance criteria are met and cite their evidence (`doctrina coverage`).

## Open questions

None.
