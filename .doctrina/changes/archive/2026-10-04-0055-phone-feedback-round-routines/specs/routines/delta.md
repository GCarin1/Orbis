# Spec Delta — capability: routines

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/routines/spec.md`

---

<!-- delta body below -->
```ops
bump-version minor
append-requirement event: When a bot calls `routine.create` with `bot` naming a bot below it in the team (one that reports to it, directly or through others), the system shall create the routine for that bot, disabled like any new routine, and post its routine card both in that bot's direct conversation and in the conversation where it was asked.
append-requirement ubiquitous: The system shall tell a bot that has reports to schedule their recurring work as Orbis routines with `routine.create`, and never with another scheduler.
append-requirement unwanted: The system shall not let `routine.create` make a routine for a bot that is neither the caller nor below it in the team.
append-criterion [verified] A manager creates a routine for its report and for its report's report (each the report's own, its card in the report's chat and where the manager was asked) and for itself, is refused one for a bot that does not report to it, and its context tells it to schedule its reports' work with Orbis routines — verified by `packages/hub/test/routines.test.ts`
```
