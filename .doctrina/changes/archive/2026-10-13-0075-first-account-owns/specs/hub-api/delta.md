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
replace-requirement event 7: When a request signed with the hub's token links an account with that account's session, or when no account is linked yet and an account of the project whose email is confirmed signs in, the hub shall open from then on for that account's sessions, and for no other account's; when the account is unlinked, its sessions shall stop opening the hub at once.
replace-requirement unwanted 7: The hub shall not take a session signed with `none` or a shared secret, one from another project, for anonymous users, expired or not valid yet beyond 30 seconds of clock skew, nor let a session link a hub that is already linked or link one with an unconfirmed email.
replace-requirement unwanted 9: Once an account is linked, the hub shall not open for any other account's session, whether its email is confirmed or not.
replace-requirement optional 1: Where accounts are on (ORBIS_SUPABASE_URL is not `off`), the hub shall report that an account opens it even before one is linked, so a new hub shows the account's sign-in and never asks for its token.
replace-criterion 12: [verified] A new hub's sign-in screen asks for the account before any link; the first session of a confirmed account opens the hub and links it, an unconfirmed email or an anonymous session open nothing, and once linked another account opens nothing while the linked one and the token still do — verified by `packages/hub/test/auth.test.ts`
```
