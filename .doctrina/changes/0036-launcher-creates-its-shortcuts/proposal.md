# Change 0036-launcher-creates-its-shortcuts — launcher creates its shortcuts

- **Status:** proposed
- **Date:** 2026-10-02
- **Owner:** Claude Code
- **Lane:** product (confident; signals: fix)
- **Affects specs:** cli
- **Documented surface:** n/a — documented in docs/windows.md with this change
## Why

The owner looked at `Orbis.bat` in its folder and saw no Orbis icon, and wanted
the launcher on the Desktop looking right. A `.bat` file cannot carry an icon;
only a shortcut can. Change 0034 made the shortcuts, but behind a second `.bat`
the owner had not run, so the first thing they saw was the plain file.

## What

- `Orbis.bat` (through `orbis-launcher.mjs`) makes the Orbis shortcuts, with
  `docs/brand/orbis.ico`, on the Desktop and in the Start menu the first time it
  runs, and says to use the shortcut in place of the `.bat`. A note in the data
  folder keeps them from returning after the owner deletes them; `--atalhos` makes
  them again and `--sem-atalhos` never does.
- `Orbis-Atalhos.bat` says the same after it runs. Docs: `docs/windows.md`
  (including the by-hand way to set the icon), CHANGELOG.
- Tests: `packages/cli/test/windows-launcher.test.ts`.

## Scope boundaries

- The `.bat` files themselves stay without an icon: Windows has no way to give one.
- Shortcut creation uses PowerShell's shell object, tested here through the decision
  logic and the output it reads, not on Windows.

## Verification

- [x] Automated checks pass: `npm run typecheck`, every Vitest project and `npm run build`.
- [x] The affected spec's acceptance criteria are met and cite their evidence (`doctrina coverage`).

## Open questions

None.
