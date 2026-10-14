# Spec Delta — capability: web-app

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/web-app/spec.md`

---

```ops
bump-version minor
append-requirement ubiquitous: The web app shall show, in a Library folder, its task board: a box to give the team a task (asking for a team first), the running task with each bot's step and note, a way to open the team's conversation and to cancel, and, once it ends, the result and the files kept, with the earlier tasks on demand — live as the hub announces each move.
append-criterion [verified] In a browser, a folder's board starts a task, shows each bot's step, opens the team's conversation, cancels the task and shows it cancelled, shows a result with its files, and asks for a team first — verified by `packages/web/test/folder-task.test.tsx`
```
