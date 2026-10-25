# Spec Delta — capability: bots

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/bots/spec.md`

---

```ops
bump-version patch
append-requirement ubiquitous: The system shall tell each bot today's date and the time of day in the user's timezone, as last told by their device, else the hub's.
append-criterion [verified] A bot reads "Today is Thursday, 1 October 2026 (America/Sao_Paulo); it is 23:30 there" at 02:30 UTC on 2 October — verified by `packages/hub/test/user-zone.test.ts`
```
