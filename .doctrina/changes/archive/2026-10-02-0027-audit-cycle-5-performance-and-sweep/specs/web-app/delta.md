# Spec Delta — capability: web-app

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/web-app/spec.md`

---

```ops
bump-version patch
append-requirement event: When the user edits a message the hub did not accept, the web app shall clear the send error.
append-criterion [verified] The send error shown after a refused message goes away when the user edits it — verified by `packages/web/test/audit-cycle5.test.tsx`.
```
