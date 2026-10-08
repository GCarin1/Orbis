# Spec Delta — capability: cli

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/cli/spec.md`

---

<!-- delta body below -->

```ops
set-header Last updated: 2026-10-08
bump-version minor
append-requirement event: When the user runs `orbis link` (or `orbis-phone link` on the phone), the CLI shall read the account's email and password at prompts, the password hidden, or from the first lines of stdin, never from arguments, link the hub as a device of that account and show the device; `--status` shows what it sent, `--sync` sends now, and `orbis unlink` leaves the account.
append-criterion [verified] `orbis link` links with the email and password piped on stdin, says a wrong password, shows the device without its token, `--status --json` answers its state, and `orbis unlink` leaves the account — verified by `packages/cli/test/link.test.ts`
```
