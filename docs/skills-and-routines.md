# Skills and routines

## Skills

A skill is a reusable procedure written once and invoked with `/name`
([`specs/skills`](../.doctrina/specs/skills/spec.md)). It is a `SKILL.md`
file — the layout Claude Code and other agent tools read — with YAML
frontmatter and Markdown steps:

```markdown
---
name: release-notes
description: Write the release notes of a version from its merged pull requests
when: after a release is tagged        # optional
---
1. List the pull requests merged since the last tag.
2. Group them by area; one line each, in plain language.
3. Post the notes as a draft for me to review.
```

- **Scope.** Account skills live in `~/.orbis/skills/<name>/SKILL.md` and are
  offered to every bot whose `skills` allowlist matches (default `["*"]`,
  globs such as `release-*` work). A bot's own skills live in
  `~/.orbis/bots/<id>/skills/` and win a name clash. Edit the files in your
  editor if you like; an invalid file is skipped until fixed.
- **Using them.** Every run lists the offered skills (name and description)
  in the bot's context, and bots read one with `skills.read` before
  following it. You invoke one by starting a message with `/name` (after
  any mentions in a group): the run gets the skill's steps as instructions
  and the rest of your message as input. A `/word` that is no skill at all
  stays plain text, so agent-CLI slash commands still pass through; a skill
  the bot is not offered posts a `skill.unavailable` event and runs nothing.
- **Claude Code.** A `claude-code` bot also finds its offered skills in
  `.claude/skills/<name>/SKILL.md` in its workspace, so Claude Code's own
  skill loading picks them up. Orbis only removes the folders it wrote.

```bash
orbis skills add ./release-notes/SKILL.md          # account
orbis skills add ./triage/SKILL.md @ana            # only Ana
orbis skills list @ana --offered
orbis skills add ./release-notes/SKILL.md --replace
orbis chat @ana "/release-notes for version 4.2"
```

In the web app: **📘 Skills** in the sidebar edits them, and typing `/` in a
message lists the skills the bot (or any group member) is offered.

## Routines

A routine is an instruction one bot runs on a schedule or when a signed
webhook arrives ([`specs/routines`](../.doctrina/specs/routines/spec.md)).
Each run happens in the bot's direct conversation, so you see it like any
other task.

- **Cron**: five-field cron in an IANA timezone, e.g. `0 9 * * 1-5` in
  `America/Sao_Paulo` (weekdays at 09:00 São Paulo time, daylight saving
  handled). The hub schedules in-process: fire times that pass while it is
  stopped are not caught up.
- **Webhook**: `POST /hooks/routines/<id>` with the raw body signed as
  `X-Orbis-Signature: sha256=<hex HMAC-SHA256 of the body under the routine
  secret>`. GitHub's own `X-Hub-Signature-256` header works as is — use the
  routine secret as the GitHub webhook secret. The payload reaches the bot as
  untrusted content; anything unsigned answers 401 and runs nothing.
- **Test first.** A new routine is disabled. **Test** runs it once in
  *draft-only* mode: every tool that acts outside Orbis (`http.fetch`,
  `browser.*`) becomes a draft card instead of running. **Enable** requires
  a successful test (or `force`). A routine set to `draft_only` behaves
  like that on every run.
- **Limits.** 50 routines per bot; the last 20 runs of each are kept.
- **Absence.** After `ORBIS_ABSENCE_PAUSE_DAYS` (default 14) days with no
  action from you through the API, scheduled routines pause and a routine
  card says so; enabling one resumes it.
- **In the web app** (⋮ → Routines), pick when it runs — every day, weekdays,
  chosen days, a day of the month or every hour, at a time — or write a cron;
  the panel reads it back in words ("Weekdays (Mon to Fri) at 09:00").
- **Bots can propose routines** with `routine.create`, which asks you first
  by default; the routine still needs your test and enable.
  - A manager makes one for a bot below it with `bot: "<handle>"`; its card
    shows in that bot's chat and where the manager was asked.
  - Routines live in Orbis only: a `claude-code` bot cannot use Claude Code's
    own schedulers (routines on claude.ai, session crons), which run where
    you cannot see, test or stop them.
- **Bots call each other's routines** with `routine.call`.
  - Name the routine as `@handle/name`, or by its id, and add a note.
  - The routine's bot runs the instruction and the note in the caller's
    conversation, and the caller gets the answer back, as with a handoff.
  - A draft-only routine stays draft-only.
  - Only enabled routines can be called, and never the caller's own.
  - `routine.list` with `bot: "all"` lists every enabled routine.
  - In the web app, an enabled routine shows the name to call it by, and its
    last run shows who called it.

```bash
orbis routines add @ana --name "Daily QA report" --cron "0 9 * * 1-5" --tz America/Sao_Paulo \
  --instruction "Run the smoke checklist on staging and post a summary"
orbis routines test rtn_…        # waits for the draft-only run and prints its reply
orbis routines enable rtn_…
orbis routines add @ana --name "On push" --webhook --instruction "Summarise the pushed commits"
orbis routines runs rtn_…
```

In the web app: **⏰ Routines** in a bot's conversation lists, creates,
tests, enables and disables its routines; routine cards appear in the
conversation.
