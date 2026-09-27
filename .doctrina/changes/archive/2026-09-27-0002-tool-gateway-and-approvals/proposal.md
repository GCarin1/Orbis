# Change 0002-tool-gateway-and-approvals — tool gateway and approvals

- **Status:** applied
- **Applied:** 2026-09-27
- **Date:** 2026-09-27
- **Owner:** Claude Code
- **Lane:** product
- **Affects specs:** tool-gateway, approvals, agent-runtimes, bots, cli, web-app

## Why

Tool gateway and approvals: one account-level tool registry with per-bot allowlist, served in-process to API brains and over MCP (HTTP /mcp plus the orbis mcp stdio bridge) to CLI brains; deterministic policy with locked rules, grants and defaults; approval cards answered from web and CLI; drafts delivered only on Send; Claude Code wired to the gateway and to the permission prompt tool

product.md delivery step 2: every later capability (handoff, memory,
computer, skills, routines, secrets) is a set of tools, and "never send,
spend or publish without the user's yes" is the product's central rule.

## What

- `packages/hub/src/tools/`: the registry (name, description, JSON Schema,
  risk class, default decision, handler), input validation, the 20,000
  character result cap, the untrusted-content envelope, run tokens, and the
  gateway that implements the engine's tool host.
- Tools owned by this change: `team.list_bots`, `conversation.post`,
  `draft.create`, `http.fetch` (GET and HEAD only). The other tools of the
  spec register with the change of their capability.
- A per-bot tool allowlist (`Bot.tools`, default `["*"]`), migration 2.
- `packages/hub/src/approvals/`: the pure policy function, the approval
  service (pending approvals, cards, `approval.requested` /
  `approval.resolved`, grants, expiry when a run ends), drafts with Send and
  Discard, webhook and outbox delivery.
- MCP: `POST /mcp` (JSON-RPC 2.0, protocol 2025-06-18) authenticated with a
  run token; the stdio bridge (`packages/hub/src/mcp/bridge.ts`) exposed as
  `orbis mcp` and as the hub's own bridge script for CLI brains; the
  `approval_prompt` tool for Claude Code, mapping its built-in tools to the
  Orbis tool with the same effect.
- The claude-code brain passes `--mcp-config`, `--strict-mcp-config` and
  `--permission-prompt-tool mcp__orbis__approval_prompt`.
- REST: `GET /approvals`, `POST /approvals/:id`, `POST /cards/:itemId/send`,
  `POST /cards/:itemId/discard`.
- CLI: inline approval prompt during `orbis chat`, `orbis approvals
  list|allow|deny`, `orbis mcp`.
- Web: approval and draft cards in the timeline, an approvals inbox.
- Contracts: hub-surface (Bot `tools`, approval shape, `/mcp` 405 on GET),
  cli-harnesses (the MCP server entry is the hub's bridge script).

## Scope boundaries

- No model-based auto review (future in the approvals spec).
- No SMTP or Slack delivery; non-webhook drafts go to the outbox file.
- `draft_only` routine mode is wired in the routines change.
- Tools of later capabilities (handoff, memory, computer, browser, skills,
  routines, secrets) are not registered here.

## Verification

- [x] Automated checks pass (`doctrina verify`).
- [x] tool-gateway criteria 1–5, approvals criteria 1–4, agent-runtimes criterion 4, cli criterion 4 and web-app criterion 2 cite passing tests (`doctrina coverage`).
- [x] A claude-code run of the fake executable receives the MCP config and the permission prompt tool in its argv.
- [x] `orbis mcp` answers `tools/list` from a running hub.

## Open questions

- None.
