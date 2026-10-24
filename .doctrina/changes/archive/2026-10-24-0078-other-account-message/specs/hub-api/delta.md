# Spec Delta — capability: hub-api

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/hub-api/spec.md`

<!--
For ADDED: include the full new spec body below. On apply, the body is
written verbatim to the target path.

For MODIFIED: prefer a fenced `ops` block — on apply the CLI executes it
against the target spec, all ops or none (ADR 0007). The verbs cover
headers, acceptance criteria, AND the EARS requirement bullets, so a
typical delta applies mechanically end to end; only free-prose rewrites
(Purpose, Maturity, ...) stay a by-hand merge. A MODIFIED delta with no
`ops` block prints a manual-merge pointer.

  ```ops
  set-header Implementation: verified — durable adapter (`src/db.ts`)
  bump-version minor
  set-criterion 1: verified
  append-criterion [unverified] new signal — verified by `test/x.test.ts`
  append-requirement event: When <trigger>, the system shall <action>.
  replace-requirement ubiquitous 2: The system shall <action>.
  ```

Requirement sections: ubiquitous | event | state | unwanted | optional.
append-* ops resolve numbering/position at APPLY time, so several open
changes appending to the same spec never collide on numbers — order of
application decides.

For REMOVED: the body may be empty; on apply, the target spec file is
deleted and the capability is recorded in the change archive only.
-->

---

<!-- delta body below -->

```ops
bump-version patch
append-requirement event: When a valid session of a confirmed account other than the linked one asks the hub, the hub shall refuse it with 403 `other_account`, counted as a refused sign-in, and the sign-in screen shall say that this Orbis belongs to another account instead of going back to itself.
append-criterion [verified] A confirmed account that does not own the hub gets 403 `other_account` (an unconfirmed one 401), and the sign-in screen says so and keeps no session — verified by `packages/hub/test/auth.test.ts`, `packages/web/test/account.test.tsx`
```
