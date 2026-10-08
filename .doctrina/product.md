# Orbis — Product

## Vision

Orbis is a self-hosted, open-source team of persistent AI colleagues. Each bot
has a name, a role, durable rules, its own memory and its own computer
(workspace, terminal and browser), works on a task from start to finish, hands
work to other bots and stops for the user's approval before anything risky.
People reach the same bots from a web app, a desktop app, a CLI and an HTTP
API. A bot's brain is the user's choice per bot: a paid model API, a local
model, or — with no API key at all — an agent CLI the user already pays for
through a subscription (Claude Code, Codex, Gemini CLI).

## Problem

Hosted persistent-bot products lock the user into one vendor's cloud, one
undisclosed model mix and one opaque weekly quota. Inside an account every bot
shares one computer, one set of files and one set of logins, so a bot is not a
security boundary, one crash stops every bot, and deleting a bot leaves its
files and sessions behind. People who already pay for an agent CLI
subscription cannot put that subscription to work as a persistent teammate,
and there is no local or self-hosted mode for teams that must keep data
(LGPD) on their own machines.

## Target users

- Developers and QA engineers who already pay for Claude Code, Codex or Gemini
  CLI and want persistent bots on top of that subscription instead of paying
  per token again.
- Small teams and solo operators who want a team of role-based bots (QA,
  engineering, PM, research, operations) running on their own machine or
  server, with their own data.
- Builders who want a hackable, MIT-licensed reference for multi-agent
  products: bots, tools, approvals, sandboxes and routines as plain code.

## Scope

In scope:

- Persistent bots with identity, role, durable rules, avatar, state and
  per-bot memory.
- Direct and group conversations (2 to 6 bots by default), @mentions,
  @everyone, threaded replies, reactions and one timeline that mixes messages,
  events and cards.
- Asynchronous bot-to-bot handoff and a lead bot that coordinates a group.
- Pluggable brains per bot: Anthropic API, OpenAI-compatible APIs (OpenAI,
  OpenRouter, Ollama, LM Studio, vLLM), subscription agent CLIs (Claude Code,
  Codex, Gemini CLI, a custom command) and a deterministic mock for tests.
- One account-level tool registry offered to API brains in-process and to CLI
  brains over MCP, with a per-bot allowlist.
- Approvals (once, always, deny), drafts that leave only after the user sends
  them, and deterministic rules that always win.
- One computer per bot: a workspace, a terminal and a browser profile,
  provided locally or in a Docker container with a desktop and live view;
  hibernation; destruction on bot deletion.
- Skills (SKILL.md) invoked with `/`, routines on schedule or webhook with a
  test run before activation and the last 20 runs kept.
- Per-bot encrypted secrets requested through a masked form.
- Usage metering per bot and account, with a per-bot spend cap.
- Bot templates as YAML with a secret scan before export.
- Clients: web app (installable), desktop app, CLI, REST + WebSocket API,
  OpenAI-compatible chat endpoint and an MCP endpoint.
- Interface in pt-BR and English.

Out of scope (deferred or rejected):

- Teach a task (recording a browser session into a draft skill) — phase 4.
- Voice: dictation, live voice chat and bot voice memos — phase 3.
- Model-based auto review of risky actions — phase 3; deterministic rules
  ship first.
- Native mobile apps with push — phase 3; the web app is installable on
  phones meanwhile.
- A public template marketplace — phase 3; templates are files and Git
  repositories until then.
- gVisor and Firecracker sandbox runtimes, egress allowlists, routing traffic
  through the user's desktop — phase 4.
- Enterprise administration: OIDC/SSO, SCIM, audit export, OpenTelemetry —
  phase 4.
- The X (Twitter) connector — phase 4.
- User accounts with sign-in, and a database shared by the Android app and the
  web app across devices — a later version (ADR 0018). Until then each Orbis
  keeps its data where it runs (the phone keeps its own), and the app opens
  the hub on the phone with no sign-in.

## Non-goals

- Not a clone of any vendor's brand: no third-party names, logos, texts,
  avatar styles or marketplace templates.
- Not a hosted SaaS: Orbis runs on the user's machine or server and never
  phones home.
- Not a workflow or flow-chart builder: bots are configured through
  conversation and plain files.
- Not a CAPTCHA or verification bypass tool: bots hand those steps to the
  user and never try to get around them.
- Not a new model or a new agent harness: Orbis orchestrates existing models
  and existing agent CLIs.

## Success criteria

- [SC1] A user creates a bot with a name, a role and durable rules, and the
  bot keeps its identity, memory and conversations across hub restarts.
- [SC2] Each bot's brain is selectable per bot between an API provider
  (Anthropic, OpenAI-compatible, local Ollama) and a subscription agent CLI
  (Claude Code, Codex, Gemini CLI) that needs no API key.
- [SC3] Every bot has its own computer — workspace, terminal and browser
  profile — that no other bot can read, and deleting the bot destroys that
  computer and its secrets.
- [SC4] Bots collaborate: group conversations of 2 to 6 bots with @mentions
  and @everyone, and asynchronous handoffs that are visible in the timeline.
- [SC5] A tool call that a rule marks "ask" waits for the user's decision
  (allow once, allow always, deny), outbound messages stay drafts until the
  user presses Send, and a deterministic rule is never overridden by a
  remembered grant or a model.
- [SC6] Skills are invoked with `/<name>`, and routines run on a schedule or
  a webhook, need a successful test run before activation and keep their
  last 20 runs.
- [SC7] The same bots answer from the web app, the desktop app, the CLI and
  the HTTP API, including an OpenAI-compatible chat endpoint.
- [SC8] Tokens and cost are visible per bot and per account, and a run that
  would exceed a bot's spend cap is refused.
- [SC9] A secret typed into a masked request form never appears in the
  timeline, in logs or in any prompt sent to a brain.
- [SC10] A bot exported as a YAML template carries its identity,
- [SC11] A user hires AI teammates: a recruiter bot's brain writes up to 30 short résumés at a time for a project or one of the user's groups, at a low token cost, and only a hire writes the full profile (instructions, tools, skills, what it will do and needs) that becomes a bot
- [SC12] A user organizes bots in named squads, each with a representative the members report to and a manager the representative reports to (one manager may take every squad); squads talk in their own chats and a shared room, reach each other by @squad, and any bot can call another bot's routines
- [SC13] A user reaches Orbis from the phone anywhere, with the computer off — the hub in a GitHub Codespace or on a server with Docker, behind a tunnel — and its Claude Code bots run on the user's own Claude plan through the token of claude setup-token, never on the API
- [SC14] A user installs the Orbis APK and uses Orbis on the phone alone — the hub, its data and Claude Code run on the phone inside Termux, started and opened by the app, with no computer, no server and no sign-in
- [SC15] A user gives a health bot the data of their watch or phone (steps, sleep, heart rate, workouts, weight) read from Health Connect on the phone — where Google Fit, Zepp (Amazfit), Samsung Health and Fitbit write — kept on their own hub and read only by the bots they allow
- [SC16] A user signs in to Orbis with an email and a password and keeps their bots and data in their own cloud account — Supabase Postgres closed to every other account by row level security, the web app and API on Cloudflare's free tier — while their phone runs the bots and keeps the secrets, and brings the data of a local hub with them
  description, skills and routines, never its computer, logins, history or
  secrets, and export is refused when the secret scan finds a credential.

## Delivery order (walking skeleton)

1. Walking skeleton: create a bot through the HTTP API → send it a message
   from the CLI → the hub runs the bot on the mock brain and on the Claude
   Code subscription brain → the reply is stored and streamed over WebSocket
   → the web app shows it in the bot's conversation. Verified end to end by
   an automated test before any capability fans out.
2. Tool gateway and approvals (the loop every other capability rides on).
3. API brains (Anthropic, OpenAI-compatible) and the remaining CLI brains
   (Codex, Gemini CLI, custom).
4. Groups, mentions and handoff; memory.
5. Computer per bot (local provider, then Docker with live view).
6. Skills, routines, secrets, usage caps, templates.
7. Desktop app packaging over the finished web app.
