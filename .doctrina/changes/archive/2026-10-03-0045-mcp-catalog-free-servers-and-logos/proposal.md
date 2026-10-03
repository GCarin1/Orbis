# Change 0045-mcp-catalog-free-servers-and-logos — mcp catalog free servers and logos

- **Status:** applied
- **Applied:** 2026-10-03
- **Date:** 2026-10-03
- **Owner:** Claude Code
- **Lane:** product
- **Affects specs:** tool-gateway, web-app
- **Documented surface:** n/a — documented in docs/mcp.md and the READMEs with this change

## Why

The owner asked for more MCP servers, free ones only. The owner also asked
for each service's own logo instead of an emoji, on the new servers and on
the ones already listed. The sidebar's Tools screen holds MCP servers and
nothing else, so the owner asked for it to be named MCP.

## What

- Catalog (`packages/hub/src/mcp/catalog.ts`): 20 new servers, 37 in all,
  every one free (no account, a free plan or a free key). Each one was
  checked before it went in:
  - an npm package exists, starts and lists its tools;
  - or an address answers `initialize`;
  - for a sign-in, the service also has dynamic client registration.
- New servers:
  - No account: Microsoft Learn, AWS Knowledge, Cloudflare Docs, GitMCP,
    CoinGecko, Jina AI Reader, Chrome DevTools, YouTube Transcript, Excel.
  - Sign-in: Todoist, monday.com, Vercel, Cloudflare Workers, Neon, Prisma
    Postgres, Postman, Semgrep, Stripe.
  - Free key: Alpha Vantage, Airtable.
- A `finance` category.
- A `query` field target. The key goes in the address the hub calls, added
  from the vault on each call. Neither the API nor the errors show it.
- Logos (`packages/web/public/logos/mcp/`):
  - Simple Icons (CC0) and each service's own site icon.
  - Sources in `SOURCES.md`.
  - `McpCatalogEntry.logo` and `McpServer.logo`.
- Web:
  - `McpLogo` shows the logo on a white tile, or the emoji when there is no
    logo or it fails to load.
  - The logo appears on the catalog cards, the connected servers and a
    bot's tool switches.
  - The sidebar and the screen are named MCP.
- Tests:
  - `mcp-servers.test.ts`: the address key, and a logo file for every
    entry.
  - `marketplace.test.tsx` and the e2e `marketplace.test.ts`.
- Docs: `docs/mcp.md`, the READMEs, CHANGELOG, the hub-surface contract.

## Scope boundaries

- Three servers stay out because they failed these checks:
  - Asana: no dynamic client registration.
  - DuckDuckGo and Wikipedia: their packages are no longer maintained.
- The logos are their owners' trademarks. They are shown to name each
  service, and they are not under the project's license.

## Verification

- [x] Automated checks pass: `npm run typecheck`, every Vitest project (the e2e included), `npm run build`.
- [x] The affected specs' acceptance criteria are met and cite their evidence (`doctrina coverage`).

## Open questions

None.
