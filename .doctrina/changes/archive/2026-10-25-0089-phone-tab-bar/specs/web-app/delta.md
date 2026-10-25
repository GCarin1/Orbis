# Spec Delta — capability: web-app

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/web-app/spec.md`

---

```ops
bump-version minor
append-requirement ubiquitous: The web app shall navigate on a phone with a tab bar at the bottom (Conversations, Library, Team, More, the rest under More), hidden inside a conversation, in place of the sidebar's rows.
append-criterion [verified] On a 390 px phone the tab bar holds Conversations, Library, Team and More, the sidebar's rows are gone, More opens Usage, and the bar hides inside a conversation — verified by `tests/e2e/phone-nav.test.ts`
```
