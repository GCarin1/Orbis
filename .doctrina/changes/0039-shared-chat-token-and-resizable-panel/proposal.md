# Change 0039-shared-chat-token-and-resizable-panel — shared chat token and resizable panel

- **Status:** proposed
- **Date:** 2026-10-02
- **Owner:** Claude Code
- **Lane:** product (confident; signals: feature)
- **Affects specs:** agent-runtimes, secrets, web-app
- **Documented surface:** n/a — documented in docs/brains.md with this change
## Why

The owner's company chat token lasts an hour or two, and each `chat-http` bot kept
its own copy: when it expired, every bot had to be opened and given the new token.
They asked for one place to change it for every bot that uses that chat API. They
also found the bot settings panel too narrow, fixed at 360 px, and asked to widen
it to see more at once.

## What

- Hub: `ChatTokens` (`secrets/chat-tokens.ts`) keeps one token per chat API origin
  in the hub's encrypted secrets, cached, and lists the APIs with their bots;
  `GET`/`PUT /api/v1/chat-http/tokens`; a secret resolver serves it to the brain;
  run output masks it. The brain (`botToken`) and the token and connection routes
  use the API's shared token, else the bot's own; messages point to Settings →
  Brains. A lone "Bearer" is no token.
- Web: **Chat API tokens** card in Settings → Brains (token or cURL, per API); the
  bot's settings and the new-bot screen save the API's token, and a new bot of an
  API with a token needs none; the token line says whether it is shared or the
  bot's own. **PanelResizer**: a handle on the side panel's edge (drag, arrows,
  Home/End, double-click), the width in a CSS variable, remembered in the browser;
  the settings form goes to two columns when the panel is 640 px or wider.
- Tests: `chat-http.test.ts` (hub), `chat-http.test.tsx` (web). Docs:
  `docs/brains.md`, CHANGELOG, the contract.

## Scope boundaries

- The token is still the owner's browser session token: Orbis does not renew it.
- A bot's own token from before is kept (not deleted) and used only while its API
  has no shared token.
- On narrow screens the side panel floats over the chat as before, with no handle.

## Verification

- [x] Automated checks pass: `npm run typecheck`, every Vitest project and `npm run build`.
- [x] The affected specs' acceptance criteria are met and cite their evidence (`doctrina coverage`).

## Open questions

None.
