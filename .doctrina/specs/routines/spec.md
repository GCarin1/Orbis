# Spec — routines

**Capability:** routines
**Status:** active
**Implementation:** verified — routines service, scheduler and webhooks (`packages/hub/src/routines/`)
**Realizes:** SC6
**Depends on:** agent-runtimes, approvals, bots
**Last updated:** 2026-09-27
**Version:** 0.5.0

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
- The system shall tell a bot that has reports to schedule their recurring work as Orbis routines with `routine.create`, and never with another scheduler.

### Event-driven

- When the cron schedule of an enabled routine fires, the system shall start a run of the routine's bot with the instruction as input.
- When a POST reaches `/hooks/routines/<id>` with a valid signature (HMAC-SHA256 of the raw body under the routine's secret, in `X-Orbis-Signature` or in GitHub's `X-Hub-Signature-256` as `sha256=<hex>`), the system shall start a run with the instruction and the payload wrapped as untrusted content.
- When a user requests a test run, the system shall run the routine once in `draft_only` mode and record it as a test run.
- When the user has shown no activity for ORBIS_ABSENCE_PAUSE_DAYS days (default 14), the system shall pause every scheduled routine and post a routine card saying so.
- When the user enables a routine, the system shall clear its absence pause and compute its next fire time from the current time.
- When the hub starts, the system shall record the outcome of each routine run whose run ended while the hub was down.
- When a bot calls another bot's enabled routine with `routine.call` (by "@handle/name" or by id, with a note), the system shall run the routine's instruction and the note as a handoff to its bot in the caller's conversation, keep the routine's draft-only mode, record the run on the routine with who called it, and give the caller the answer back like a handoff's.
- When a bot lists routines with `routine.list` for another bot or for "all", the system shall list their enabled routines as "@handle/name" with their trigger and instruction.
- When a bot calls `routine.create` with `bot` naming a bot below it in the team (one that reports to it, directly or through others), the system shall create the routine for that bot, disabled like any new routine, and post its routine card both in that bot's direct conversation and in the conversation where it was asked.

### Unwanted-behavior (must-not)

- The system shall not enable a routine that has no successful test run unless the request carries `force: true`.
- The system shall not start a run for a webhook request whose signature is missing or does not match.
- The system shall not create a 51st routine for a bot.
- The system shall not catch up on fire times that passed while the hub was stopped.
- The system shall not start a scheduled run of a routine while its previous scheduled run is queued, running or waiting; it shall post one `routine.skipped` event per such run instead.
- The system shall not let `routine.call` run a disabled routine, nor a bot's own routine.
- The system shall not let `routine.create` make a routine for a bot that is neither the caller nor below it in the team.

## Acceptance criteria

1. [verified] Routines are created, listed, edited and deleted; the 51st routine of a bot answers 409; only the last 20 runs are kept — verified by `packages/hub/test/routines.test.ts`.
2. [verified] A cron routine in `America/Sao_Paulo` fires at the matching local time under a fake clock and starts a run with its instruction — verified by `packages/hub/test/routines.test.ts`.
3. [verified] A webhook with a valid `X-Orbis-Signature` or `X-Hub-Signature-256` starts a run with the payload wrapped as untrusted content, and a bad signature answers 401 and starts nothing — verified by `packages/hub/test/routines.test.ts`.
4. [verified] Enabling a routine with no successful test run answers 409 unless `force` is set — verified by `packages/hub/test/routines.test.ts`.
5. [verified] After the absence period, scheduled routines are paused and a routine card is posted — verified by `packages/hub/test/routines.test.ts`.
6. [verified] A routine scheduled every minute whose run takes longer skips its next turns with a single `routine.skipped` event and fires again once the run ended; a routine run cut by a restart reads failed with the reason — verified by `packages/hub/test/audit-cycle1.test.ts`.
7. [verified] A bot lists every enabled routine, is refused a disabled routine, an unknown one and its own, and calls another bot's routine with a note: it runs in the caller's conversation with the instruction and the note, the caller hears back, and the routine's last run says who called it — verified by `packages/hub/test/squads.test.ts`.
8. [verified] An enabled routine shows how other bots call it, and its last run who called it — verified by `packages/web/test/squads.test.tsx`.
9. [verified] A manager creates a routine for its report and for its report's report (each the report's own, its card in the report's chat and where the manager was asked) and for itself, is refused one for a bot that does not report to it, and its context tells it to schedule its reports' work with Orbis routines — verified by `packages/hub/test/routines.test.ts`

## Maturity

**MVP (committed):**

- Cron and webhook triggers, test runs, history of 20, limit of 50, absence pause, routine cards.

**Future (aspirational, not committed):**

- Native Slack and Linear event subscriptions without a signing proxy.
- Durable execution through an external workflow engine.

## Out of scope for this spec

- Draft delivery (see `specs/approvals`).
