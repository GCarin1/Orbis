# Spec Delta — capability: web-app

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/web-app/spec.md`

---

```ops
bump-version minor
append-requirement ubiquitous: The web app shall have a Library screen in its menu: every file as a grid with tabs (all, images, videos, documents, folders, archived), a search by name, files added from the device, and the space used with the largest files; a file opens large or plays, with download, forward to a bot or a group, move to a folder, archive and delete, and several are selected (by a long press or Select) to act on together.
append-requirement ubiquitous: The web app shall show a Library folder with its description, the bots and groups that work on it (chosen in a dialog) and its files, and shall show a message's deleted file as deleted.
append-criterion [verified] In a browser, the Library shows the grid and the space used, filters by tab and name, opens a file and forwards it to a bot with a message, selects several to archive, move or delete, opens a folder to add files and choose who works on it, and a message shows its deleted file — verified by `packages/web/test/library.test.tsx`
```
