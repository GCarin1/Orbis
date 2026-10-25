# Spec Delta — capability: web-app

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/web-app/spec.md`

---

```ops
bump-version patch
append-requirement ubiquitous: The web app shall put the squads' org chart at the centre of their screen, a squad in it jumping to its card, keep rare actions (one manager for every squad) in the screen's menu, and say each squad's manager as text with a way to change it.
append-criterion [verified] The chart reads "★ Ana · 2 bots" and jumps to the card; the manager reads as text until Change; one manager for every squad is applied from the ⋮ menu — verified by `packages/web/test/squads.test.tsx`
append-criterion [verified] In a browser one manager for both squads is set from the ⋮ menu and the chart shows them under Max — verified by `tests/e2e/squads.test.ts`
```
