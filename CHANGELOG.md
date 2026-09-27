# Changelog

All notable changes to Orbis are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/). Each entry names the Doctrina
change that delivered it.

## [Unreleased]

### Added

- API and CLI brains (change 0003-api-and-cli-brains):
  - `anthropic` brain on the official `@anthropic-ai/sdk`: streaming tool loop
    through the gateway, `claude-opus-5` default, adaptive thinking, prompt
    caching, server-side refusal fallback on first-party Opus 5 / Opus 5.5 /
    Fable 5.1, refusal and truncated-tool-call handling, usage and cost.
  - `openai` brain for any OpenAI-compatible server (OpenAI, OpenRouter,
    Ollama, LM Studio, vLLM) with streamed function calling; no key on
    localhost.
  - `codex` (ChatGPT subscription, thread resume) and `gemini-cli` (Google
    account, workspace MCP settings restored after each run) brains.
  - `GET /api/v1/runtimes/health` and `orbis runtimes check`.
  - OpenAI-compatible `GET /v1/models` and `POST /v1/chat/completions`
    (JSON and server-sent events) with `orbis:<handle>` models.
  - Web: base URL field for API brains.
- Tool gateway and approvals (change 0002-tool-gateway-and-approvals):
  - One account-level tool registry with JSON Schema validation, risk
    classes, a per-bot allowlist (`Bot.tools`), the 20,000-character result
    cap and `<untrusted-content>` envelopes; tools `team.list_bots`,
    `conversation.post`, `draft.create` and `http.fetch` (GET/HEAD).
  - MCP endpoint `POST /mcp` with per-run tokens and the stdio bridge
    (`orbis mcp`, `dist/mcp-bridge.js`); Claude Code bots get the Orbis tools
    and `--permission-prompt-tool mcp__orbis__approval_prompt`.
  - Deterministic policy (locked deny → locked ask → grants → rules →
    default), approval cards with allow once / always / deny, expiry when the
    run ends, `GET/POST /api/v1/approvals`.
  - Drafts with editable fields, Send (webhook POST or `outbox.jsonl`) and
    Discard; `POST /api/v1/cards/:id/send|discard`.
  - CLI: inline approvals in `orbis chat`, `orbis approvals`, `orbis mcp`.
  - Web: approval and draft cards, approvals inbox.
- Walking skeleton (change 0001-walking-skeleton):
  - Hub with SQLite storage, REST API under `/api/v1`, WebSocket stream,
    OpenAPI document, bearer-token auth and the web app served at `/`.
  - Bots with handle, role, durable description, avatar, brain, policy,
    computer configuration, skills allowlist and spend cap; pin, hide,
    duplicate and delete with full cascade and workspace destruction.
  - Direct conversations with one timeline, thread replies, reactions and a
    FIFO run queue per bot and conversation; bot states with live events.
  - Brains: `mock`, `claude-code` (headless Claude Code on your subscription,
    with session resume) and `custom-cli`; scrubbed environment for every
    CLI brain.
  - Context assembly within the contract budgets (30 items, 12,000
    characters, 8 relevant memories plus every preference).
  - `orbis` CLI: `serve`, `open`, `login`, `bots`, `chat`.
  - Web app: roster with state rings and labels, timeline with collapsible
    run steps, composer, bot creation, pt-BR and English, installable PWA.
