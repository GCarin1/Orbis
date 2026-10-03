# Change 0048-mcp-screen-redesign — mcp screen redesign

- **Status:** applied
- **Applied:** 2026-10-03
- **Date:** 2026-10-03
- **Owner:** Claude Code
- **Lane:** product
- **Affects specs:** web-app, tool-gateway
- **Documented surface:** n/a — documented in docs/mcp.md with this change; the catalog gains one optional field (`readOnly`)

## Why

The owner asked for a new look for the MCP page and the connected MCPs,
modelled on other MCP marketplaces (Claude, Cursor), and to keep phones in
mind.

## What

- Research. Claude's directory, Cursor's MCP settings, VS Code's MCP gallery
  and Docker's MCP Toolkit all share these patterns:
  - a Browse tab and an Installed tab;
  - cards with a logo, a short description and one button;
  - a details view before connecting, saying what the server reads and
    writes;
  - installed servers with their state, an on and off control per server or
    per tool, and their actions in a menu.
- `Marketplace.tsx`, rewritten:
  - Explore holds a search, a how-it-connects filter, categories with
    counts, the Start here picks, and cards with Connect.
  - `CatalogDetails` is the details sheet.
  - Connected shows a summary, an empty state, and server cards with a
    status dot, a stack of bot faces, bot toggle chips, tools split by what
    only reads and what asks first, and a ⋮ menu.
  - Your own server opens in a sheet.
- `Sheet.tsx` is a right-edge sheet, full screen on a phone. Esc, the
  backdrop, Close and the phone's Back close it (`addBackLayer` in
  `native.ts`). Hiring reuses it.
- Hub: the catalog says whether a server only reads (`readOnly`).
- Tests: `marketplace.test.tsx`, the e2e `marketplace.test.ts`, and the
  phone sweep, which now covers the details and Your own server.
- Docs: `docs/mcp.md`, CHANGELOG, the hub-surface contract.

## Scope boundaries

- The tools of a server are known only once it is connected; the details do not list them before.
- No per-tool switches: the allowlist patterns in a bot's settings still do that (`!mcp.<server>.<tool>`).

## Verification

- [x] Automated checks pass: `npm run typecheck`, every Vitest project (the e2e included), `npm run build`.
- [x] The affected specs' acceptance criteria are met and cite their evidence (`doctrina coverage`).

## Open questions

None.
