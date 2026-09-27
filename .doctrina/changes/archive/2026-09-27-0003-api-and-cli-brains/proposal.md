# Change 0003-api-and-cli-brains — api and cli brains

- **Status:** applied
- **Applied:** 2026-09-27
- **Date:** 2026-09-27
- **Owner:** Claude Code
- **Lane:** product
- **Affects specs:** agent-runtimes, hub-api, cli

## Why

Brains: Anthropic Messages API brain on the official SDK with streaming tool loop, OpenAI-compatible brain for OpenAI, OpenRouter, Ollama, LM Studio and vLLM, Codex CLI and Gemini CLI subscription brains, the brain health check, and the OpenAI-compatible chat endpoint so any OpenAI client can talk to a bot

product.md delivery step 3 and success criterion SC2: a bot's brain is
selectable between an API provider and a subscription agent CLI.

## What

- `anthropic` brain on `@anthropic-ai/sdk`: a streaming manual tool loop
  (`client.beta.messages.stream` + `finalMessage()`), adaptive thinking on
  models that support it, `eager_input_streaming` tools validated by the
  gateway, stop-reason checks (`refusal`, `max_tokens` with tool use,
  `pause_turn`), the step limit, `claude-opus-5` as default model, the
  server-side refusal fallback (`fallbacks: "default"`) on first-party
  Opus 5, Opus 5.5 and Fable 5.1, usage and cost from a price table.
- `openai` brain: Chat Completions with streaming and function calling over
  `fetch`, for any OpenAI-compatible base URL; no key needed on localhost.
- `codex` and `gemini-cli` brains per `contracts/cli-harnesses`, with Codex
  thread resume and the Gemini workspace MCP settings file.
- `GET /api/v1/runtimes/health` and `orbis runtimes check`.
- `GET /v1/models` and `POST /v1/chat/completions` (JSON and SSE).
- Docs (brains, API), CHANGELOG; ADR 0003 landed.

## Scope boundaries

- No spend caps or usage reports (usage change); the cost is recorded only.
- No price-table overrides from a configuration file yet (usage change).
- No Agent Client Protocol adapter.

## Verification

- [x] Automated checks pass (`doctrina verify`).
- [x] agent-runtimes criteria 2, 3, 5 and 8 and hub-api criterion 3 cite passing tests (`doctrina coverage`).
- [x] The anthropic adapter runs against a fake Messages API speaking real SSE through the official SDK.

## Open questions

- None.
