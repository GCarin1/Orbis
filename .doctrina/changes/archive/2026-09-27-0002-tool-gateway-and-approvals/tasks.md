# Tasks — Change 0002-tool-gateway-and-approvals

- [x] Migration 2: `bots.tools` allowlist; shared `Bot.tools`; API schema; bots test covers it.
- [x] Tool registry: definitions, glob allowlist, schema validation, result cap, untrusted envelope.
- [x] Tools: `team.list_bots`, `conversation.post`, `draft.create`, `http.fetch` (GET/HEAD).
- [x] Policy function with the fixed precedence and tool defaults; table test.
- [x] Approval service: rows, cards, run and bot `waiting`, events, grants, deny notes, expiry on run end; REST routes.
- [x] Drafts: card, Send with edits (webhook POST or outbox file), Discard; REST routes.
- [x] Tool gateway as the engine's tool host: run tokens, bridge for in-process brains, MCP wiring for CLI brains.
- [x] MCP HTTP endpoint and the stdio bridge (`orbis mcp` and the hub's bridge script); `approval_prompt` for Claude Code.
- [x] claude-code argv with `--mcp-config`, `--strict-mcp-config`, `--permission-prompt-tool`.
- [x] CLI: inline approvals in `orbis chat`, `orbis approvals`, `orbis mcp`; tests.
- [x] Web: approval and draft cards, approvals inbox; timeline test.
- [x] Contracts, docs (approvals, MCP), CHANGELOG; land ADRs 0004 and 0006.
