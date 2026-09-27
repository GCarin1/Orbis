# ADR 0003 — Two brain families behind one normalized event stream

- **Status:** accepted
- **Scope:** agent-runtimes, usage, tool-gateway
- **Date:** 2026-09-27
- **Deciders:** project owner (requirement), Claude Code
- **Supersedes:** —
- **Superseded by:** —
- **Evidence:** n/a — no implementation yet; land with the brains change
- **Landed:** 2026-09-27 — `packages/hub/src/brains/types.ts`, `packages/hub/src/runs/engine.ts`, `packages/hub/src/brains/anthropic.ts`, `packages/hub/src/brains/claude-code.ts`

## Context

The owner requires two ways to power a bot: through APIs, and through agent
CLIs "sem usar a API … sem necessidade de uso de APIs pagas se você já paga
uma assinatura". API brains (Anthropic Messages, OpenAI-compatible Chat
Completions) return tool calls that Orbis must execute. CLI brains (Claude
Code, Codex, Gemini CLI) run their own agent loop, own their tools, and print
their progress in each CLI's own JSON format; they log in with the user's
subscription and need no API key.

## Decision

Every brain is an adapter that emits the same normalized events
(`run.started`, `step.thinking`, `step.text`, `step.tool_call`,
`step.tool_result`, `run.usage`, `run.finished`, `run.failed`). API adapters
run the agent loop inside the hub and execute tools through the gateway. CLI
adapters spawn the CLI headless in the bot's workspace, connect it to the
gateway over MCP, translate its output line by line, and store the CLI's
session id so the next run resumes the same session. The run engine,
timeline, usage meter and clients only ever see normalized events. The exact
argv and output mapping per CLI are owned by `contracts/cli-harnesses`.

## Alternatives considered

1. API brains only — rejected: violates the owner's requirement and makes
   every user pay per token again.
2. Scraping interactive CLI sessions through a pseudo-terminal — rejected:
   fragile; every CLI already has a headless JSON mode.
3. Driving CLIs through the Agent Client Protocol only — rejected for the
   MVP: not every target CLI speaks it yet; an ACP adapter can join later as
   one more adapter.

## Consequences

**Positive**

- A bot switches brains by changing one field; nothing else changes.
- Subscription users run persistent bots at no extra API cost.

**Negative**

- CLI output formats change without notice; adapters must be tolerant and
  the contract kept current.
- A CLI brain's built-in tools (its own shell, file edits) run outside the
  Orbis gateway; Orbis bounds them by the working directory, the CLI's own
  sandbox flags and, for Claude Code, the permission-prompt tool.

**Neutral**

- Usage from CLI brains is recorded as "covered by subscription".
