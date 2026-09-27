# Tasks — Change 0001-walking-skeleton

- [x] Root workspace: package.json scripts (typecheck, test, build, check), tsconfig base, Vitest workspace config.
- [x] `@orbis/shared`: domain types, stream event names, brain kinds, handle slug and validation helpers, with unit tests.
- [x] Hub configuration from the environment (empty means unset), data directory, generated token file.
- [x] Database: `node:sqlite` open with WAL, migration runner, migration 001 with every MVP table and FTS5.
- [x] Event bus and WebSocket stream route with subscription filter.
- [x] Bearer-token auth hook, error shape, health route, OpenAPI document.
- [x] Bots repository and routes: create, list (pinned first, hidden filter), get by id or handle, patch, duplicate, delete with cascade and workspace destroy, max-bots and handle rules.
- [x] Conversations: direct conversation on demand, timeline items, messages, thread parent, reactions, read marker.
- [x] Run engine: per (bot, conversation) FIFO queue, run records, steps, bot state machine with `bot.state` events, reply message.
- [x] Context assembly: identity, description, recent items within 30 items and 12,000 characters.
- [x] Brains: mock; process runner with scrubbed env, timeout and stderr tail; claude-code stream-json adapter with session resume; custom-cli adapter.
- [x] Hub tests: bots, conversations, runs, context, api, stream, mock, claude-code, cli-harnesses.
- [x] CLI: config precedence, HTTP client, `serve`, `bots` subcommands, `chat` one-shot and interactive; tests for config, bots and chat.
- [x] Web app: token screen, roster, conversation timeline, composer, live stream store, pt-BR and English; tests for roster and i18n.
- [x] Hub serves the built web app at `/`.
- [x] End-to-end test in Chromium: create bot, send message in the UI, see the reply.
- [x] README.md, README.pt.md, docs/ (architecture, brains, API, CLI) and CHANGELOG.md.
- [x] Land ADRs 0001 and 0002 with evidence paths (0003 lands with the brains change, 0007 with the desktop change).
