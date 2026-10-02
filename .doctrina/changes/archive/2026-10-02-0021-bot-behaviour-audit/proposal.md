# Change 0021-bot-behaviour-audit — Bot behaviour audit

- **Status:** applied
- **Applied:** 2026-10-02
- **Date:** 2026-10-02
- **Owner:** Claude Code
- **Lane:** product (confident; signals: bug, feature)
- **Affects specs:** conversations, handoff, agent-runtimes, tool-gateway, computer, skills

## Why

The project owner tested Orbis on Windows with a team of four bots and found
that bots are the core of the product and do not yet behave: a simple
question in a group set the bots answering each other in a loop, each reply
a new request to their brains; the Playwright MCP server and the Claude Code
brain would not start; the browser was missing; a bot spent its whole 15
minutes waiting for approvals of Linux commands that cannot work on Windows
while trying to write a skill; and a bot set to the OpenAI API with no key
failed again and again with an error that did not say what to do. They asked
for the fixes and a full audit of how bots behave.

## What

- The mention loop: a run's chain id (database migration 6), mention rules
  (a list of more than two bots wakes no one, a woken bot wakes no one, a bot
  already in the chain is not woken again), and a run budget per chain,
  `ORBIS_MAX_CHAIN_RUNS` (12). The bots' context and `team.list_bots` stop
  writing `@` where it would wake a colleague.
- Windows: `.cmd` shims pointing at a native program (Claude Code 2's
  `claude.exe`) and npm's own `npx.cmd` / `npm.cmd` (Node 24); an MCP server's
  crash is reported by its error line; the browser falls back to the Chrome or
  Edge on the machine; the bot is told which OS and shell it has.
- Run limits: the timeout counts working time only, not waiting for the
  user; an API brain's last step answers without tools; a third identical
  tool call is refused; an unreachable server or an unready brain fails with
  what to do; bots start idle after a restart.
- `skills.create`: a bot writes a skill for itself or a colleague.
- Hub source under `packages/hub/src/` (collab, runs, brains, tools, computer,
  mcp, skills, db); tests `bot-behaviour`, `runtimes/windows-shims` and the
  updated handoff, anthropic, openai and mcp-bridge tests; the brain label
  says the OpenAI API needs a paid key.
- Docs: `docs/bot-behaviour-audit.md`, `docs/collaboration.md`,
  `.env.example`, CHANGELOG, contract hub-surface.

## Scope boundaries

- Brains that run as CLIs (Claude Code, Codex, Gemini, Cursor) keep their own
  step limits; the identical-call guard still covers the Orbis tools they call.
- No Windows machine ran these fixes: the shim tests use the exact texts npm,
  Node 24 and Claude Code 2 install.
- Web search stays an MCP server from the marketplace (Exa, for example);
  this change adds no built-in search tool.

## Verification

- [x] Automated checks pass: `npm run typecheck`, every Vitest project (hub, shared, cli, desktop, web, e2e) and `npm run build`.
- [x] The affected specs' acceptance criteria are met and cite their evidence (`doctrina coverage`).

## Open questions

None.
