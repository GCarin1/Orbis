# Change 0022-chat-and-bot-deep-audit — Chat and bot deep audit

- **Status:** applied
- **Applied:** 2026-10-02
- **Date:** 2026-10-02
- **Owner:** Claude Code
- **Lane:** product (confident; signals: bug, audit)
- **Affects specs:** conversations, agent-runtimes, tool-gateway, memory, bots, approvals, handoff, web-app

## Why

After the fixes of change 0021 the project owner asked for a complete and
deep audit of the chat and the bots, the core of the product. This change
reads every path of a run — how it is queued, what the bot is told, how each
brain is started and stopped, how tool calls and approvals travel, what the
bot remembers, and how the chat shows all of it — and fixes each defect
found, with a regression test for each.

## What

- CLI brains: the run's clock alone stops the process (the 0021 fix
  covered API brains only, so Claude Code was still killed during an
  approval); long prompts on stdin; a gone session or Codex thread restarts
  with the whole conversation (Codex failed every later message); 24-hour
  MCP tool timeout for Codex and the Gemini CLI.
- The MCP bridge forwards tool calls side by side over node:http, with no
  5-minute limit on an answer.
- API brains: retries of 429 and 5xx, tool calls whatever the finish reason,
  `<think>` blocks as thinking.
- Context: today's date and time zone, the user's language, where the run
  takes place and who is there; long items cut, not dropping all history;
  other bots' failures left out.
- Memory: no summaries of mention or report answers, no duplicates, 200 per
  bot, stop words left out of the search, at most 3 summaries in a context;
  database migration 7 removes the summaries the 0021 loop left.
- Runs: the bot's state with runs in two conversations; two approvals open
  at once; runs and handoff cards left waiting by a stopped hub are closed;
  `POST /api/v1/runs/:id/retry` (migration 7 adds `runs.retry_of`); a denied
  call is not counted as a repeat; `http.fetch` names the network error.
- Chat: Markdown messages, one bubble per busy bot with Stop and its queue,
  "waiting for you", Try again, earlier messages, scrolling that keeps the
  user's place, a send error that keeps the text, no send on an IME Enter.
- Tests: `packages/hub/test/chat-audit.test.ts`,
  `packages/web/test/chat-audit.test.tsx`.
- Docs: `docs/bot-behaviour-audit.md` (second round), `docs/api.md`,
  CHANGELOG, contract hub-surface.

## Scope boundaries

- No Windows machine ran the CLI changes; the fakes replay the shapes the
  real CLIs print, and the Codex resume error and `tool_timeout_sec` were
  checked against Codex CLI 0.158.
- Web search stays an MCP server from the marketplace.

## Verification

- [x] Automated checks pass: `npm run typecheck`, every Vitest project (hub, shared, cli, desktop, web, e2e) and `npm run build`.
- [x] The affected specs' acceptance criteria are met and cite their evidence (`doctrina coverage`).

## Open questions

None.
