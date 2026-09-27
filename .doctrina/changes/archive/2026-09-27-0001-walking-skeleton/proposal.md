# Change 0001-walking-skeleton — walking skeleton

- **Status:** applied
- **Applied:** 2026-09-27
- **Date:** 2026-09-27
- **Owner:** Claude Code
- **Lane:** product
- **Affects specs:** bots, conversations, agent-runtimes, memory, hub-api, cli, web-app, computer

## Why

Walking skeleton: create a bot through the HTTP API, chat with it from the orbis CLI, run it on the mock brain and on the Claude Code subscription brain, store and stream the reply over WebSocket, and show it in the web app

product.md names this path as delivery step 1: nothing fans out before one
request travels the whole stack and a test proves it.

## What

- The npm-workspaces monorepo from ADR 0001: `packages/shared`,
  `packages/hub`, `packages/cli`, `packages/web`, root scripts
  `typecheck`, `test`, `build` and `check`, which `doctrina verify` runs.
- `@orbis/shared`: domain types (Bot, Conversation, TimelineItem, Run,
  Step), event names, brain kinds, handle rules.
- `@orbis/hub`: configuration from the environment (hub-surface contract),
  the SQLite database with migrations (ADR 0002), the event bus, the bot
  repository and routes (the whole `bots` capability), direct
  conversations with threads and reactions, the run engine with the
  per-conversation queue and the bot state machine, context assembly, the
  `mock`, `claude-code` and `custom-cli` brains, per-bot workspace
  directories, bearer-token auth, the OpenAPI document and the WebSocket
  stream.
- `@orbis/cli` (`orbis`): configuration precedence, `serve`, `bots`
  (list, create, show, edit, delete, duplicate) and `chat` (one-shot and
  interactive).
- `@orbis/web`: the roster, the direct conversation timeline with live
  updates, the composer, the token screen, pt-BR and English.
- An end-to-end test that drives the real browser against a real hub.
- Specs: `bots` becomes verified; the other touched specs record which
  criteria this change proves and keep their declared deferral for the rest.
- README (en and pt-BR), `docs/`, and `CHANGELOG.md`.

## Scope boundaries

- No tool gateway, MCP endpoint or approvals yet (change 0002). The
  claude-code brain runs without Orbis tools until then.
- No API brains, codex or gemini-cli brains, health check or
  OpenAI-compatible endpoint yet (brains change).
- No groups, mentions, handoff or memory entries yet (collaboration change).
- No computer tools, providers beyond workspace directories, or live view.
- No desktop app.

## Verification

- [x] Automated checks pass (`doctrina verify`: typecheck, test, build).
- [x] The affected specs' acceptance criteria named in the deltas cite passing tests (`doctrina coverage --only bots,conversations,agent-runtimes,memory,hub-api,cli,web-app`).
- [x] `tests/e2e/skeleton.test.ts` passes in a real Chromium: bot created in the UI, message sent from the UI, reply shown in the timeline and the roster.
- [x] `orbis chat` against a running hub prints the mock bot's reply (`packages/cli/test/chat.test.ts`).

## Open questions

- None.
