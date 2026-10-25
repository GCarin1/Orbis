# Spec Delta — capability: web-app

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/web-app/spec.md`

---

```ops
bump-version patch
append-requirement ubiquitous: The web app shall show, on a phone, a back bar to the conversations at the top of every full screen (Library, Skills, MCP, Squads, Hiring, Usage, Settings).
append-criterion [verified] On a 390 px phone, Library, Skills, Squads, Usage and Settings each lead back to the conversations — verified by `tests/e2e/phone-nav.test.ts`
```
