# Spec — routines

**Capability:** routines
**Status:** active
**Implementation:** verified — routines service, scheduler and webhooks (`packages/hub/src/routines/`)
**Realizes:** SC6
**Depends on:** agent-runtimes, approvals, bots
**Last updated:** 2026-09-27
**Version:** 0.2.0

## Purpose

A routine tells a bot when to work without being asked: on a schedule or when
an outside event arrives through a webhook (GitHub, Slack, Linear or any
sender that signs its request). Routines are tested before they are switched
on, keep a short run history, and pause when the user has been away long
enough that nobody would read the results.

## Requirements (EARS)

### Ubiquitous

- The system shall store each routine for one bot with a name, a trigger (a cron schedule with an IANA timezone, or a webhook), an instruction, an approval mode (`normal` or `draft_only`), an enabled flag and a webhook secret.
- The system shall keep the last 20 runs of each routine with start time, status, whether it was a test, and a summary of the result.
- The system shall hold at most 50 routines per bot.
- The system shall post a routine card in the bot's direct conversation when a routine is created, enabled, disabled or paused.

### Event-driven

- When the cron schedule of an enabled routine fires, the system shall start a run of the routine's bot with the instruction as input.
- When a POST reaches `/hooks/routines/<id>` with a valid signature (HMAC-SHA256 of the raw body under the routine's secret, in `X-Orbis-Signature` or in GitHub's `X-Hub-Signature-256` as `sha256=<hex>`), the system shall start a run with the instruction and the payload wrapped as untrusted content.
- When a user requests a test run, the system shall run the routine once in `draft_only` mode and record it as a test run.
- When the user has shown no activity for ORBIS_ABSENCE_PAUSE_DAYS days (default 14), the system shall pause every scheduled routine and post a routine card saying so.
- When the user enables a routine, the system shall clear its absence pause and compute its next fire time from the current time.

### Unwanted-behavior (must-not)

- The system shall not enable a routine that has no successful test run unless the request carries `force: true`.
- The system shall not start a run for a webhook request whose signature is missing or does not match.
- The system shall not create a 51st routine for a bot.
- The system shall not catch up on fire times that passed while the hub was stopped.

## Acceptance criteria

1. [verified] Routines are created, listed, edited and deleted; the 51st routine of a bot answers 409; only the last 20 runs are kept — verified by `packages/hub/test/routines.test.ts`.
2. [verified] A cron routine in `America/Sao_Paulo` fires at the matching local time under a fake clock and starts a run with its instruction — verified by `packages/hub/test/routines.test.ts`.
3. [verified] A webhook with a valid `X-Orbis-Signature` or `X-Hub-Signature-256` starts a run with the payload wrapped as untrusted content, and a bad signature answers 401 and starts nothing — verified by `packages/hub/test/routines.test.ts`.
4. [verified] Enabling a routine with no successful test run answers 409 unless `force` is set — verified by `packages/hub/test/routines.test.ts`.
5. [verified] After the absence period, scheduled routines are paused and a routine card is posted — verified by `packages/hub/test/routines.test.ts`.

## Maturity

**MVP (committed):**

- Cron and webhook triggers, test runs, history of 20, limit of 50, absence pause, routine cards.

**Future (aspirational, not committed):**

- Native Slack and Linear event subscriptions without a signing proxy.
- Durable execution through an external workflow engine.

## Out of scope for this spec

- Draft delivery (see `specs/approvals`).
