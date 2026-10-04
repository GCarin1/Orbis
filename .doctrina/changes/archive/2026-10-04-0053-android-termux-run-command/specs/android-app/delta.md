# Spec Delta — capability: android-app

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/android-app/spec.md`

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
  append-criterion [verified] new signal — verified by `test/x.test.ts`
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
append-requirement event: When Termux's permission to run commands is refused or never shown, the app shall say what the system reports (Termux's version and source, whether Termux declares the permission, whether the app asks for it, whether it is granted) and point to `orbis-phone open`, which needs no Android permission.
append-requirement event: When `orbis-phone open` runs in Termux, the system shall start the hub if it is stopped and open the app with a sign-in link to it, and the app shall keep that link's token as its own.
append-requirement event: When the app opens on the hub on this phone without Termux's permission and the hub already answers with its token, the app shall open it without asking for the permission.
append-criterion [verified] The token of a sign-in link to the hub on this phone is the app's own (a link to another hub or without a token gives none), and the diagnosis states Termux's version and source, whether it declares the permission, whether the app asks for it and whether it is granted — verified by `packages/android/app/src/test/java/app/orbis/android/LocalHubTest.java`
append-criterion [verified] With stand-ins for Termux, `orbis-phone open` starts the stopped hub, hands the app a sign-in link with the hub's token through `am start`, and only opens the app again when the hub already runs — verified by `packages/hub/test/phone-script.test.ts`
append-criterion [verified] In a real browser, a refused permission shows the system's facts, the `orbis-phone open` way and a button to open Termux — verified by `tests/e2e/android-connect.test.ts`
```
