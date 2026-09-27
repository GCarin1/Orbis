# Design — Change 0001-walking-skeleton

## Approach

The hub is a Fastify 5 server (`packages/hub/src/server.ts`) built by a
`createHub(config)` factory that tests call with a temporary data
directory, so every test runs a real hub on a real SQLite file. Routes are
declared with TypeBox schemas: the same schema validates the request, types
the handler and feeds `@fastify/swagger` for `/api/v1/openapi.json`.
Validation errors are mapped to the contract's error shape.

Persistence is a thin repository layer over `node:sqlite`
(`packages/hub/src/db/`). Migration 001 creates every table the MVP needs
(bots, conversations, members, items, runs, memory with FTS5, routines,
routine runs, secrets, grants, usage), so later changes add behaviour, not
schema churn, and the bot delete cascade is real from day one.

An in-process event bus (`EventBus`) carries the contract's stream events.
The WebSocket route subscribes a client to the bus with the client's
conversation filter.

The run engine (`packages/hub/src/runs/engine.ts`) owns: a FIFO queue per
(bot, conversation), the run record, the bot state machine, and a loop that
consumes the brain adapter's normalized events, persists each step, emits
`run.step`, and appends the final reply as a bot message. Brain adapters
implement one interface:

    run(input: BrainInput, ctx: BrainContext): AsyncIterable<BrainEvent>

`mock` is deterministic. `claude-code` and `custom-cli` share a process
runner (`packages/hub/src/brains/process.ts`) that builds the scrubbed
environment, enforces the timeout, keeps the tail of stderr and yields
stdout lines; each adapter only maps lines to events.

The CLI is dependency-free (`node:util` `parseArgs`, global `fetch` and
`WebSocket` of Node 22). The web app is React 19 + Vite with a small
Zustand store fed by the stream.

## Alternatives considered

- Express or Hono instead of Fastify — Fastify's schema-first routes give
  validation, types and OpenAPI from one declaration.
- A job queue library for runs — unnecessary for one process; a per-key
  promise chain gives the FIFO guarantee the spec asks for.
- Server-sent events instead of WebSocket — the client must also send
  subscribe messages and, later, takeover input.

## Trade-offs and risks

- `node:sqlite` is synchronous: long queries would block the event loop.
  All MVP queries are indexed point reads or small scans.
- The claude-code adapter cannot be exercised against the real CLI in CI
  (it needs a subscription login); tests replay recorded stream-json
  through a fake executable, per `contracts/cli-harnesses`.

## Decisions to record as ADRs

- None new: ADRs 0001, 0002, 0003 and 0007 already cover the structure.
  0001 and 0002 are landed with evidence at close; 0003 and 0007 land when their other half ships.
