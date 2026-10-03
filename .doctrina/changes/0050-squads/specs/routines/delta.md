# Spec Delta — capability: routines

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/routines/spec.md`

---

```ops
bump-version minor
append-requirement event: When a bot calls another bot's enabled routine with `routine.call` (by "@handle/name" or by id, with a note), the system shall run the routine's instruction and the note as a handoff to its bot in the caller's conversation, keep the routine's draft-only mode, record the run on the routine with who called it, and give the caller the answer back like a handoff's.
append-requirement event: When a bot lists routines with `routine.list` for another bot or for "all", the system shall list their enabled routines as "@handle/name" with their trigger and instruction.
append-requirement unwanted: The system shall not let `routine.call` run a disabled routine, nor a bot's own routine.
append-criterion [verified] A bot lists every enabled routine, is refused a disabled routine, an unknown one and its own, and calls another bot's routine with a note: it runs in the caller's conversation with the instruction and the note, the caller hears back, and the routine's last run says who called it — verified by `packages/hub/test/squads.test.ts`.
append-criterion [verified] An enabled routine shows how other bots call it, and its last run who called it — verified by `packages/web/test/squads.test.tsx`.
```
