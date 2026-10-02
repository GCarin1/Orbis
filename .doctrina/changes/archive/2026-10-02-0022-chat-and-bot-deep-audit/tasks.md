# Tasks — Change 0022-chat-and-bot-deep-audit

- [x] Read the run engine, context assembly, every brain adapter, the MCP bridge, the gateway, approvals, memory, collaboration and the web chat; list the defects.
- [x] CLI brains: engine-owned time limit, stdin for long prompts, session restart with the whole conversation, Codex thread fallback, MCP tool timeouts.
- [x] MCP bridge: side-by-side tool calls over node:http with no answer time limit.
- [x] API brains: retries, tool calls with any finish reason, `<think>` blocks.
- [x] Context and memory: date, language, place, clipped items, failures of others, summary rules, stop words, migration 7.
- [x] Runs: bot state across conversations, two approvals, restart closing waiting runs and handoff cards, retry route, denied calls, fetch errors.
- [x] Chat: Markdown, one bubble per bot with Stop and queue, waiting note, Try again, earlier messages, scroll, send errors, IME.
- [x] Regression tests in hub and web; full suites, typecheck, build and e2e green.
- [x] Audit document, API docs, CHANGELOG, contract.
