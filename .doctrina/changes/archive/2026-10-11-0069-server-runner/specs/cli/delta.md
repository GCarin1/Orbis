# Spec Delta — capability: cli

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/cli/spec.md`

---

<!-- delta body below -->

```ops
set-header Last updated: 2026-10-11
bump-version minor
append-requirement event: When the user runs `orbis data export [-o file] [--password]`, the CLI shall save the hub's `.orbis` export readable only by its owner, its secrets sealed only with a password of at least 10 characters; `orbis data import <file> [--password]` shall import it into the hub and show what was added and what was already there; the password is read at a hidden prompt or from stdin, never from arguments.
append-criterion [verified] `orbis data export` refuses a short password and saves the file private; `orbis data import` refuses a wrong password, imports bots and sealed secrets into another hub, and doubles nothing the second time — verified by `packages/cli/test/data.test.ts`
```
