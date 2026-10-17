# Spec Delta — capability: web-app

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/web-app/spec.md`

---

```ops
bump-version patch
append-requirement ubiquitous: The web app shall fold an approval card the user already answered to one line (who asked, the tool, the answer), its input shown on a tap.
append-criterion [verified] An answered approval shows as one folded line without its buttons — verified by `packages/web/test/timeline.test.tsx`
```
