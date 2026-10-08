# Spec Delta — capability: web-app

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/web-app/spec.md`

---

<!-- delta body below -->

```ops
set-header Last updated: 2026-10-08
bump-version minor
append-requirement event: When the user downloads their data in Settings → Data, the web app shall ask for a password typed twice to seal the bots' keys (or none, leaving them out) and save the `.orbis` file to the browser's downloads or the phone's Downloads.
append-requirement event: When the user imports a `.orbis` file in Settings → Data, the web app shall send it to this hub with the file's password, or to the cloud account it is signed in to (or signs in to there) without that password, and show per kind of data what came in and what was already there, and the warnings.
append-criterion [verified] Settings → Data downloads the file with the secrets sealed by the password typed twice, or without them; imports into this hub with the file's password and shows what came in; imports into the cloud account it signs in to without sending the file's password — verified by `packages/web/test/data.test.tsx`
```
