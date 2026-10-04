# Spec Delta — capability: handoff

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/handoff/spec.md`

---

<!-- delta body below -->
```ops
bump-version minor
replace-requirement ubiquitous 6: The system shall tell each bot that writing `@handle` or `@role` in a reply wakes that colleague, that in a group the members it names are all called while elsewhere it calls one or two colleagues this way at most, and to write a colleague's name without `@` otherwise.
append-criterion [verified] A bot's team context says that in a group the members it names with @ are all called, and elsewhere one or two colleagues at most — verified by `packages/hub/test/routines.test.ts`
```
