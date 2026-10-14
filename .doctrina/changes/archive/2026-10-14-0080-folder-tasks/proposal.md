# Change 0080-folder-tasks — folder-tasks

- **Status:** applied
- **Applied:** 2026-10-14
- **Date:** 2026-10-14
- **Owner:**
- **Lane:** product (uncertain)
- **Affects specs:** conversations, web-app

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

The owner asked to assign one or more bots, or a whole group, to a Library folder, and to give them a task to do
with its files. They should coordinate among themselves to reach the result. They also asked for a progress board
(change 0079 made the folders and their teams).

## What

- Hub, `packages/hub/src/library/tasks.ts` (`FolderTasks`):
  - migration 17 adds `folder_tasks` and `task_steps`, which stay on the hub;
  - the team's room is the folder's group, the one bot's chat, or a "📁 <folder>" group of its bots, made once;
  - the task is posted as the user's message, naming the lead, `team.handoff`, `library.save` and
    `task.progress`, with no @mentions, so only the lead wakes;
  - run hooks move each bot's step; the task ends when its chain has no run left, with the lead's last answer;
  - the files it keeps are marked `task`;
  - routes to start, list, read and cancel a task; the `folder.task` event; the `task.progress` tool.
- Web: `FolderTaskBoard.tsx` in the folder view, which can open the team's conversation.
- Docs: `docs/files.md`, the contract and the CHANGELOG.

## Scope boundaries

The coordination is the existing handoff and report (change 0014); nothing new orchestrates the bots.

## Verification

<!--
How you will know the change is correctly applied. Use checkboxes: every
box here is a claim that must be PROVEN before the change is done.
`doctrina change archive` refuses to archive while any box below is
unchecked (pass --force to archive anyway and record the gap). Distinguish
"task marked done" from "verification passed" — link the evidence.
-->

- [x] Automated checks pass (`doctrina verify`).
- [x] The affected spec's acceptance criteria are met and cite their evidence: `packages/hub/test/folder-tasks.test.ts`, `packages/web/test/folder-task.test.tsx`.

## Open questions

<!-- List unresolved decisions. Empty if none. -->
