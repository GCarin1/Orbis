# Spec Delta — capability: web-app

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/web-app/spec.md`

---

```ops
bump-version patch
append-requirement unwanted: The web app shall not leave a primary button disabled without a line under it saying what it waits for (connect, sign in, generate candidates, create a routine, sign in with ChatGPT).
append-criterion [verified] Connect says to paste the access code while it is disabled and the line goes once one is typed — verified by `packages/web/test/missing.test.tsx`
```
