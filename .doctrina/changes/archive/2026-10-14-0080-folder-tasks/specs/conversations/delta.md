# Spec Delta — capability: conversations

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/conversations/spec.md`

<!--
For ADDED: include the full new spec body below. On apply, the body is
written verbatim to the target path.

For MODIFIED: prefer a fenced `ops` block — on apply the CLI executes it
against the target spec, all ops or none (ADR 0007). The verbs cover
headers, acceptance criteria, AND the EARS requirement bullets, so a
typical delta applies mechanically end to end; only free-prose rewrites
(Purpose, Maturity, ...) stay a by-hand merge. A MODIFIED delta with no
`ops` block prints a manual-merge pointer.

  ```ops
  set-header Implementation: verified — durable adapter (`src/db.ts`)
  bump-version minor
  set-criterion 1: verified
  append-criterion [unverified] new signal — verified by `test/x.test.ts`
  append-requirement event: When <trigger>, the system shall <action>.
  replace-requirement ubiquitous 2: The system shall <action>.
  ```

Requirement sections: ubiquitous | event | state | unwanted | optional.
append-* ops resolve numbering/position at APPLY time, so several open
changes appending to the same spec never collide on numbers — order of
application decides.

For REMOVED: the body may be empty; on apply, the target spec file is
deleted and the capability is recorded in the change archive only.
-->

---

<!-- delta body below -->

```ops
bump-version minor
append-requirement event: When the user gives a Library folder a task, the system shall post it as the user's message in the team's conversation — the folder's first group, the one bot's direct chat, or a group of the folder's bots made once and used again — naming the lead, who splits the work with team.handoff and gives the final result, and shall keep one step per bot on the task's board.
append-requirement event: When a run of a task's chain starts or ends, or a bot calls task.progress, the system shall move that bot's step (pending, doing, done, failed) and announce the task; when no run of the chain is left, the task shall end with the lead's last answer as its result, and the files its runs keep in the folder shall be marked as the task's.
append-requirement unwanted: The system shall not start a second task on a folder while one runs, a task on a folder with no team, nor a group larger than the hub's group size for a folder's bots.
append-criterion [verified] A folder task goes to the team's own group (made once, used again), the folder's group or one bot's chat; the lead hands work out, each step moves, the files kept are the task's and the lead's last answer is the result; a second task, a folder with no team and an empty task are refused; a task is cancelled with its runs, fails when the lead fails, and task.progress needs a task — verified by `packages/hub/test/folder-tasks.test.ts`
```
