# Spec Delta — capability: memory

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/memory/spec.md`

---

```ops
bump-version patch
append-requirement ubiquitous: The system shall fill the relevant entries of a context in rank order from a search three times wider than the 8 entries it keeps, so summaries over the limit of 3 leave their places to the next facts.
append-criterion [verified] With ten summaries ranked above a fact, the context holds 3 summaries and the fact; accented Portuguese words such as "não", "está" and "você" are not searched — verified by `packages/hub/test/review.test.ts`.
```
