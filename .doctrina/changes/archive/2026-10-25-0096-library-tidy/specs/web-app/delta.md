# Spec Delta — capability: web-app

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/web-app/spec.md`

---

```ops
bump-version patch
append-requirement ubiquitous: The web app shall show the Library's folders as a section above its files, the space used as one line under them that opens the full card, and the card on its own once the disk is nearly full (90%).
append-criterion [verified] The Library shows the folders above the grid with no Folders tab, the space as "O Orbis usa 4 KB · … livres no disco" that opens the card, and the card on its own with the disk 96% full — verified by `packages/web/test/library.test.tsx`
```
