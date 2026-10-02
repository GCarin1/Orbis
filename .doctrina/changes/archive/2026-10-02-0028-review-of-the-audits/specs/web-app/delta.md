# Spec Delta — capability: web-app

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/web-app/spec.md`

---

```ops
bump-version patch
append-requirement unwanted: The web app shall not count a bot starting to work as a new message below.
append-requirement unwanted: The web app shall not offer Try again on a routine's run, and shall say why when trying again is refused.
append-requirement event: When the web app loads a conversation's runs, it shall keep the steps that already streamed in for a run whose loaded copy has fewer.
append-criterion [verified] While the user reads history, a bot starting to work shows no "new below" and a new message shows "1 new below"; a routine's failed run offers no Try again; a refused retry says why; loaded runs keep the steps that streamed in — verified by `packages/web/test/review.test.tsx`.
```
