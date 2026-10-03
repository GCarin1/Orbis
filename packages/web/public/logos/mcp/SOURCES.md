# MCP server logos

The logos in this folder identify the services in the MCP catalog
(`packages/hub/src/mcp/catalog.ts`). Each logo is a trademark of its owner,
shown only to identify that owner's service; the logos are **not** covered by
Orbis's MIT license.

| File | Source |
|---|---|
| `airtable.svg`, `atlassian.svg`, `brave-search.svg`, `chrome-devtools.svg` (Google Chrome), `cloudflare.svg`, `github.svg`, `huggingface.svg`, `linear.svg`, `mcp.svg` (Model Context Protocol), `neon.svg`, `notion.svg`, `postman.svg`, `prisma.svg`, `sentry.svg`, `stripe.svg`, `supabase.svg`, `todoist.svg`, `vercel.svg`, `youtube-transcript.svg` (YouTube) | [Simple Icons](https://simpleicons.org) 16.33.0 (CC0-1.0 icon data), each path drawn in the brand's color |
| `tavily.svg` | tavily.com — the site's icon |
| `semgrep.svg` | semgrep.dev — the site's icon |
| `playwright.svg` | playwright.dev/img/playwright-logo.svg |
| `exa.svg` | exa.ai/images/logo/exa-logo-blue.svg, cut to the symbol |
| `excel.svg` | Wikimedia Commons, "Microsoft Office Excel (2019–2025).svg" |
| `aws-knowledge.svg` | Wikimedia Commons, "Amazon Web Services Logo.svg" |
| `microsoft-learn.svg` | The Microsoft symbol (four squares in the brand's colors) |
| `firecrawl.png` | firecrawl.dev/apple-touch-icon.png |
| `jina.png` | jina.ai/icons/favicon-128x128.png |
| `gitmcp.png` | gitmcp.io/img/icon_black_cropped.png |
| `deepwiki.png`, `context7.png`, `canva.png`, `coingecko.png`, `monday.png`, `alphavantage.png` | Each site's own icon, as the site publishes it (fetched at 128 px) |

The PNGs are 128 × 128 with a transparent background. To add one: put the
service's official icon here as `<catalog id>.svg` (or `.png`, 128 px), list its
source above, and set `logo` on the catalog entry.
