# Tasks — Change 0055-phone-feedback-round-routines

<!--
Each task is a single checkable item. Keep tasks small (under a few hours
of work). The change is done when every box is checked and
`doctrina close 0055-phone-feedback-round-routines` succeeds — the close applies the deltas,
archives the change and updates the index, so those are not boxes here.
-->

- [x] Claude Code runs deny its own schedulers (`--disallowedTools`); argv test and the cli-harnesses contract
- [x] `routine.create` with `bot` for a bot below the caller, card where it was asked; manager guidance; hub tests
- [x] Mentions: a group's members named in a reply are called; the list rule counts bots outside the conversation
- [x] Squad member picker as rows; `botLabel` in every reports-to and manager select
- [x] Routines panel: schedule in words, repeat/day/time picker, untested choice, layout; localized routine cards
- [x] Bot header with a ⋮ menu; e2e tests open panels through it
- [x] Stream reconnects at once on screen/focus/online and replaces a silent connection within 4 s
- [x] Android stays connected by default; the phone hub holds Termux's wake lock; docs/android.md
- [x] Spec deltas, CHANGELOG, `doctrina verify` green
