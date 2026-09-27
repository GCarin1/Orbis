# Spec — usage

**Capability:** usage
**Status:** active
**Implementation:** verified — usage report and spend-cap hooks (`packages/hub/src/usage/`), price table with `<data>/prices.json` overrides
**Realizes:** SC8
**Depends on:** agent-runtimes, bots
**Last updated:** 2026-09-27
**Version:** 0.2.0

## Purpose

Quotas must not be opaque. Orbis meters every run's tokens and cost, shows
them per bot and per account, and enforces a spend cap per bot. Runs on a
subscription CLI brain are recorded with the cost the CLI reports, flagged as
covered by the subscription, so the user sees what the subscription saves.

## Requirements (EARS)

### Ubiquitous

- The system shall record for every run the input tokens, output tokens, cached input tokens when the brain reports them, the cost in USD and whether the cost is covered by a subscription.
- The system shall compute the cost of API brains from a price table per model shipped with the hub and overridable in the hub configuration file.
- The system shall record for subscription CLI brains the cost the CLI reports (for Claude Code, `total_cost_usd`), flagged as covered by the subscription, and zero when the CLI reports none.
- The system shall report usage per bot and per account for the current calendar month in UTC and for any requested date range.

### Event-driven

- When a run is about to start and the bot's month-to-date capped cost has reached its spend cap, the system shall refuse the run, set the bot state to `blocked` and post an event naming the cap.
- When a run's capped cost crosses the bot's spend cap during execution, the system shall stop the run after the current step and post an event naming the cap.
- When the data directory holds `prices.json`, the system shall apply its per-model prices over the shipped table, so local and third-party models can be priced.

### Unwanted-behavior (must-not)

- The system shall not count subscription-covered cost toward the spend cap unless the bot's configuration sets `capIncludesSubscription` to true.

## Acceptance criteria

1. [verified] Usage of three runs across two bots sums per bot and per account for the month and for a date range — verified by `packages/hub/test/usage.test.ts`.
2. [verified] A bot at its cap has its next run refused with a blocked state and an event, and a run that crosses the cap stops after the current step — verified by `packages/hub/test/usage.test.ts`.
3. [verified] Subscription-covered cost is flagged and left out of the cap by default — verified by `packages/hub/test/usage.test.ts`.
4. [verified] API usage is priced from the shipped table, a model with no price costs zero, and `prices.json` adds and overrides prices — verified by `packages/hub/test/usage.test.ts`.

## Maturity

**MVP (committed):**

- Per-run metering, price table, monthly and range reports, per-bot cap.

**Future (aspirational, not committed):**

- A cost estimate before a run starts.
- Routing simple tasks to cheaper or local models automatically.

## Out of scope for this spec

- Billing or payments: Orbis never charges anyone.
