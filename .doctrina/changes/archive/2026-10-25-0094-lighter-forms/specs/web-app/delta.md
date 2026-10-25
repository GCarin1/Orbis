# Spec Delta — capability: web-app

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/web-app/spec.md`

---

```ops
bump-version patch
append-requirement ubiquitous: The web app shall show a bot's settings with typed values in normal weight, each name said once, chips that jump to its parts, the face with a tap to change it, and whom a squad member answers to as a sentence instead of a locked control.
append-criterion [verified] A squad member's settings say "Reports to Ana · …, through the Growth squad" with no locked select, and saving sends no reportsTo — verified by `packages/web/test/squads.test.tsx`
```
