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
bump-version minor
append-requirement optional: Where ORBIS_OWNER_EMAIL names the hub's owner and no account is linked yet, the hub shall report that an account opens it, and the first session of the account with that email, its email confirmed, shall link the hub to that account and open it, so the owner never needs the hub's token.
append-requirement unwanted: The hub shall not let ORBIS_OWNER_EMAIL open it for another account, for an unconfirmed email, or after an account is linked for any account but the linked one.
append-criterion [verified] With its owner named, the sign-in screen asks for the account before any link; only the owner's session with a confirmed email (in any letter case) opens the hub and links it, another account, an unconfirmed email or an anonymous session open nothing, and once linked another account with the same email opens nothing; a malformed ORBIS_OWNER_EMAIL stops the hub — verified by `packages/hub/test/auth.test.ts`
```
