# Design — Change 0007-skills-and-routines

## Approach

**Skills live on disk as SKILL.md files**, the format Claude Code, Codex and
other agent CLIs already read: `<data>/skills/<name>/SKILL.md` for the
account and `<data>/bots/<id>/skills/<name>/SKILL.md` for one bot (deleted
with the bot's directory). A `SkillStore` parses the frontmatter (`name`,
`description`, optional `when`), validates the name `[a-z0-9-]{1,64}` and
the description, and answers "which skills does this bot get": the account
skills matching its `skills` allowlist globs plus its own, own skills
winning a name clash. The engine gains context sections: the store adds
"Skills you can use" (name — description) to the system text of every run.
A user message `/<name> rest` is resolved in the router: an offered skill
becomes `EnqueueRequest.skill` with the rest as input; any other name posts
a `skill.unavailable` event and starts nothing. Claude Code runs get the
offered skills written to `<workspace>/.claude/skills/<name>/SKILL.md`
before the process starts (a run hook), and stale Orbis-written skills are
removed.

**Routines** use the `routines` and `routine_runs` tables of migration 1.
A trigger is JSON: `{ "type": "cron", "cron": "0 9 * * 1-5", "timezone":
"America/Sao_Paulo" }` or `{ "type": "webhook" }`. A `RoutineScheduler`
keeps the next fire time of every enabled, unpaused cron routine
(croner's `nextRun`, computed in the routine's timezone from an injected
clock) and a timer to the earliest one; `tick(now)` fires what is due, so
tests drive time directly. Runs go to the bot's direct conversation with
trigger `routine` (or `webhook`), and a `routine_runs` row follows each run
to its end (status, first 200 characters of the reply); only the newest 20
rows per routine are kept. Webhooks verify HMAC-SHA256 of the raw body in
constant time before anything else; the payload reaches the bot inside
`<untrusted-content>`.

**draft_only**: test runs (and routines set to `draft_only`) register the
run id; the gateway's before-call hook, which may now answer instead of the
tool, turns every `external` tool call of such a run into a draft card
("the routine wanted to call …") and tells the bot so.

**Absence**: every authenticated non-GET API request records the user's
last activity; the scheduler's daily check pauses cron routines when it is
older than ORBIS_ABSENCE_PAUSE_DAYS and posts one routine card per bot.
Enabling a routine again clears its pause.

## Alternatives considered

1. Skills in SQLite — rejected: CLI brains read files, and users edit
   SKILL.md in their editor; the disk is the natural source of truth.
2. A cron library-free matcher — rejected: DST and timezones are exactly
   what croner gets right.
3. Blocking external tools in test runs with an error — rejected: a draft
   shows the user what the routine would have done, which is the point of a
   test.

## Trade-offs and risks

- A skill file edited on disk by hand is read as is on the next run;
  invalid files are skipped and reported by `GET /skills`.
- The scheduler is in-process: a hub that is down misses fire times (no
  catch-up); documented.

## Decisions to record as ADRs

- None: storage and scheduling are inside the specs' requirements.
