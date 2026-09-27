# Architecture

Orbis is one TypeScript monorepo (ADR 0001) with four packages:

| Package | Role |
|---------|------|
| `@orbis/shared` | Domain types (`Bot`, `Conversation`, `TimelineItem`, `Run`, `Step`), stream event names, handle and mention helpers. |
| `@orbis/hub` | The server: configuration, SQLite store, repositories, services, the run engine, brain adapters, the per-bot computer, REST + WebSocket routes. |
| `@orbis/cli` | The `orbis` command. It talks to the hub only through the public API. |
| `@orbis/web` | The React web app, served by the hub at `/` and shown by the desktop app. |

## The hub

```
HTTP (Fastify)  ── auth hook (bearer / stream query token)
   │
   ├── routes ── BotService ─────────── BotsRepo ────────┐
   │         └── ConversationService ── ConversationsRepo├─ SQLite (node:sqlite, WAL)
   │                  │                 ItemsRepo        │   migrations in src/db
   │                  ▼                                  │
   │             RunEngine ── RunsRepo, BrainSessionsRepo┘
   │                  │   ├── assembleContext (identity, memories, history)
   │                  │   ├── BrainRegistry → mock | claude-code | custom-cli | …
   │                  │   └── ComputerManager → local | docker, BrowserService
   │                  ▼
   └── /api/v1/stream ◄── EventBus ◄── Timeline (post, react, cards)
```

- **Store.** One SQLite file in the data directory, opened through the built-in
  `node:sqlite` module (ADR 0002). Migration 1 creates every table of the MVP
  (bots, conversations, members, items, runs, brain sessions, memory with FTS5,
  routines, routine runs, secrets, approvals, settings).
- **Event bus.** Every change that a client may show is published once
  (`bot.state`, `bot.updated`, `timeline.item`, `run.updated`, `run.step`, …)
  and fanned out to WebSocket subscribers filtered by conversation.
- **Run engine.** `enqueue()` records a `queued` run and chains it behind the
  runs of the same bot and conversation (FIFO). `execute()` resolves the brain
  adapter, fails fast when the brain is misconfigured, assembles the context,
  consumes the adapter's normalized events, persists each step, updates the
  bot state, enforces the timeout, and finally posts the reply as a bot
  message (or a `run.failed` event).
- **Brains.** Each adapter implements `check()` (what is missing from the
  configuration) and `run()` (an async stream of normalized events). CLI
  brains share `process.ts`: scrubbed environment, timeout with process-group
  kill, stderr tail, line-by-line stdout.
- **Collaboration.** `collab/handoff.ts` registers `team.handoff` and run
  hooks: handoff cards follow the receiver's run, returned results wake the
  sender, bot replies in a group that mention members start their runs, and
  every bot-started run carries `depth + 1` up to `ORBIS_MAX_HANDOFF_DEPTH`.
  `collab/memory.ts` registers `memory.save` / `memory.search`, writes a
  `summary` after each successful run and serves the memory routes. Engine
  `onEnded` hooks run before the terminal `run.updated` event, so a client
  sees the follow-up run queued before the run that caused it ends.
- **Skills and routines.** `skills/` keeps SKILL.md files on disk, adds the
  offered skills to every run's system text (an engine context section),
  resolves `/name` messages in the router, and writes Claude Code's
  `.claude/skills/` before its runs. `routines/` stores routines in SQLite,
  fires cron routines from an in-process scheduler with an injectable
  clock (croner, IANA timezones), verifies webhook HMACs on the raw body,
  and turns external tool calls of draft-only runs into draft cards through
  the gateway's before-call hook.
- **Computer.** `computer/manager.ts` gives each bot one computer through a
  provider (ADR 0005): `local` (directories and child processes on the hub
  host) or `docker` (one `orbis/desktop` container and one volume per bot,
  every docker call through an injectable command runner). The manager
  starts a computer when a tool needs it, hibernates it after
  `hibernateAfterMin`, holds takeovers (the gateway's before-call hook makes
  the bot's tool calls wait), and destroys it with the bot. `computer/browser.ts`
  drives Chromium with Playwright: a persistent per-bot profile for `local`,
  DevTools into the container for `docker`. `computer/paths.ts` confines file
  tools to the workspace, symlinks included.

## Bot states

| State | When |
|-------|------|
| `idle` | nothing running (or the user read a finished conversation) |
| `thinking` | a run started or the brain is producing output |
| `working` | the brain is executing a tool |
| `waiting` | a run waits for the user (approval, secret) |
| `blocked` | the last run failed, timed out or was refused |
| `done` | the last run finished; back to `idle` when the conversation is read |

## Specs, contracts and decisions

- Behaviour: `.doctrina/specs/<capability>/spec.md` (EARS requirements and
  acceptance criteria, each citing the test that proves it).
- Seams: `.doctrina/contracts/hub-surface.md` (ports, environment, budgets,
  every route and event shape) and `.doctrina/contracts/cli-harnesses.md`
  (argv and output mapping of each agent CLI).
- Decisions: `.doctrina/decisions/` (ADRs 0001–0008).
