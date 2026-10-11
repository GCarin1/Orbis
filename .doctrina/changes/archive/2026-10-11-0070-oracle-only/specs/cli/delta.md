# Spec Delta — capability: cli

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/cli/spec.md`

---

<!-- delta body below -->

```ops
set-header Last updated: 2026-10-11
bump-version minor
replace-requirement event 15: When the user runs `orbis link --status`, the CLI shall show the device, what waits to be sent and the last error; there is no cloud to choose (change 0070).
replace-criterion 16: [verified] `orbis link` links with the email and password piped on stdin and `--status --json` answers the device without its token — verified by `packages/cli/test/link.test.ts`
```
