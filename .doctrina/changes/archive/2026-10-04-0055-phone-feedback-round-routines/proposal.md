# Change 0055-phone-feedback-round-routines — Phone feedback round: routines stay in Orbis (Claude Code's own schedulers off, managers create routines for their reports), a representative calling its group's members wakes them, squad member picker and 'reports to' selects with the role, a readable routines panel, notifications while the app is in the background, no stall after returning to the app, and a ⋮ menu in the 1:1 chat header

- **Status:** applied
- **Applied:** 2026-10-04
- **Date:** 2026-10-04
- **Owner:**
- **Lane:** product (uncertain)
- **Affects specs:** routines, conversations, handoff, agent-runtimes, web-app, android-app

<!--
Optional, and usually absent. The closing docs gate reads COMMAND and FLAG
names out of the prose below and asks for documentation when it finds any.
It cannot tell a change from a mention: explaining an effect, or writing a
Scope boundaries line about what this deliberately does NOT touch, names
things just as loudly as changing them would.

When that happens, say so on the record instead of forcing the close:

- **Documented surface:** n/a — names two commands to explain an effect; alters neither

`none` reads the same as `n/a`, and a BARE one silences nothing — the
reason is the declaration.
-->

## Why

Phone feedback round: routines stay in Orbis (Claude Code's own schedulers off, managers create routines for their reports), a representative calling its group's members wakes them, squad member picker and 'reports to' selects with the role, a readable routines panel, notifications while the app is in the background, no stall after returning to the app, and a ⋮ menu in the 1:1 chat header

## What

The owner used Orbis on the phone (hub in Termux, Claude Code bots) and reported seven problems; each is fixed
at its cause:

1. **Routines in Claude's cloud.** Asked to create routines for its reports, a Claude Code manager used Claude
   Code's own `RemoteTrigger` (routines on claude.ai, outside Orbis), because `routine.create` only made routines
   for the caller. Now every `claude-code` run denies `RemoteTrigger`, `CronCreate`, `CronDelete`, `CronList` and
   `ScheduleWakeup` with `--disallowedTools`; `routine.create` takes `bot` (a bot below the caller in the team) and
   shows the routine's card where the manager was asked; a manager's context says to schedule with Orbis routines.
2. **A representative calling three members woke none.** The "more than two bots is a list" rule now counts only
   bots outside the conversation: in a group, the members a reply names are called (still bounded by the chain
   limits, and a bot woken by a mention wakes nobody).
3. **Squad member picker** stacked checkbox, face and name in uneven bubbles (`.prefs-form label` overrode it): one
   row per bot with face, name, role and current squad.
4. **"Reports to" and manager selects** show each bot as "Name · Role" (`botLabel`).
5. **Routines panel:** the schedule is said in words ("Weekdays (Mon to Fri) at 18:00"), picked from the usual
   repeats with days and time (cron stays a choice), read back before creating; the timezone field no longer runs
   off a phone's edge; an untested routine offers "test" or "enable anyway" in the user's language instead of the
   hub's English error; routine cards say whose routine it is and when it runs.
6. **No notifications / stall after returning:** the Android app stays connected in the background by default
   (Android froze it within minutes, so no event reached it); back on screen the stream reconnects at once instead
   of waiting out a backoff of up to 15 s, and replaces a dead connection within 4 s; the hub on the phone holds
   Termux's wake lock while it runs (the app started it without one).
7. **1:1 chat header:** five icons squeezed the name ("Camila @ca…"); now face, name, role and state, with the
   options in a ⋮ menu like a group's.

## Scope boundaries

- Routines still start disabled until the user tests or force-enables them (specs/routines); a manager making a
  routine for a report does not enable it.
- The handoff and chain limits are unchanged; only which mentions count toward "a list" changed.
- Routines already created in Claude's cloud are not touched: the owner deletes them on claude.ai.
- Android's per-device battery and child-process limits stay a setting the user changes (docs/android.md).

## Verification

<!--
How you will know the change is correctly applied. Use checkboxes: every
box here is a claim that must be PROVEN before the change is done.
`doctrina change archive` refuses to archive while any box below is
unchecked (pass --force to archive anyway and record the gap). Distinguish
"task marked done" from "verification passed" — link the evidence.
-->

- [x] Automated checks pass (`doctrina verify`, or the project's typecheck/test/build).
- [x] The affected spec's acceptance criteria are met and cite their evidence (`doctrina coverage`).

## Open questions

<!-- List unresolved decisions. Empty if none. -->
