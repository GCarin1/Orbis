# ADR 0009 — A bot may work on the user's own machine by explicit per-bot consent

- **Status:** accepted
- **Scope:** computer, web-app, templates, approvals
- **Date:** 2026-09-28
- **Deciders:** project owner (asked for bots that use their own machine or a simple image), Claude Code
- **Supersedes:** —
- **Superseded by:** —
- **Evidence:** `packages/hub/src/computer/host.ts`, `packages/hub/src/computer/manager.ts`, `packages/hub/test/computer/host.test.ts`, `packages/web/src/components/ComputerModes.tsx`
- **Landed:** —

## Context

ADR 0005 gives every bot its own computer behind a provider interface, with a
`local` folder for development and a `docker` container as the isolation
boundary. The project owner asked for a third choice: a bot that works on
their own machine — their programs, their files, a browser they can see —
next to the container image. That is the opposite of isolation, so it must
be deliberate, visible and reversible.

## Decision

A third provider, `host`, runs a bot's commands on the user's machine, in a
folder the user chooses (default: their home), with the user's environment
minus the hub's own variables (`ORBIS_*`, `ANTHROPIC_API_KEY`,
`OPENAI_API_KEY`); file tools stay inside that folder; the browser is a
visible window (the installed Chrome or Edge when present). It is chosen per
bot, never by default: the web app requires an explicit consent the first
time a bot gets it, file writes default to `ask` on it (commands already
do), templates never export or import it, and deleting the bot leaves the
folder alone. The bot is told in every run that it works on the user's real
files.

## Alternatives considered

1. A per-bot container only — rejected: the owner wants bots that use their
   installed programs and logins, which a container cannot reach.
2. A hub-wide switch that turns every bot's computer into the host — rejected:
   one careless bot would get the whole machine; consent belongs to one bot.
3. Driving the user's everyday browser profile — rejected: Chrome refuses
   automation of the default profile, and a bot should not hold every login;
   each bot keeps its own profile, visible on the user's screen.

## Consequences

**Positive**

- Bots can do real work on the user's machine (their projects, their tools)
  and the user sees the browser act.

**Negative**

- `host` is no boundary at all: a bot's shell can reach anything the user
  can. The consent text, the defaults (`ask` for commands and writes) and
  the docs say so.

**Neutral**

- ADR 0005 stands: providers are still one interface; `host` is the third.
