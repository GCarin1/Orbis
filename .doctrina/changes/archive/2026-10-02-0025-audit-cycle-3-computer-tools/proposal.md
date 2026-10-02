# Change 0025-audit-cycle-3-computer-tools — Audit cycle 3 — computer tools

- **Status:** applied
- **Applied:** 2026-10-02
- **Date:** 2026-10-02
- **Owner:** Claude Code
- **Lane:** product (confident; signals: bug, audit)
- **Affects specs:** computer

## Why

Cycle 3 of the five audit-and-fix cycles: the bot's computer — the shell,
the file tools and the browser — read with the project owner's Windows
machine in mind.

## What

- cmd.exe writes in the console's OEM code page (850 in Brazil): "não"
  reached the bot as "n�o". Each command now switches the console to UTF-8
  first, and Python is asked for UTF-8.
- The bot's own computer gave commands only PATH, HOME, LANG and three
  Windows variables: npm, git and python failed without APPDATA, TEMP,
  USERPROFILE or ProgramFiles. The system's variables pass, and the bot gets
  a Windows profile of its own under its home.
- `computer.read_file` read any file whole as text: a 2 GB file took
  the hub down, a PNG came back as garbage, and a missing file answered with
  an ENOENT naming the hub's full path. Each now gets a plain answer.
- `browser.snapshot` showed the first 12,000 characters of a page and no
  way to read on; it now takes an offset.
- Tests: `packages/hub/test/audit-cycle3.test.ts`. Docs: CHANGELOG,
  `docs/bot-behaviour-audit.md`.

## Scope boundaries

- The `host` provider keeps the user's own environment; only the Python
  encoding is added there. No Windows machine ran these changes.

## Verification

- [x] Automated checks pass: `npm run typecheck`, every Vitest project and `npm run build`.
- [x] The affected specs' acceptance criteria are met and cite their evidence (`doctrina coverage`).

## Open questions

None.
