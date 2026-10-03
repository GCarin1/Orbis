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
set-header Implementation: verified — Java WebView shell in `packages/android` (connect screen with pairing by code or QR code, hub-only navigation, file picker, Downloads, Back, notifications, keep-connected service, dictation, voice, share); APK built by `.github/workflows/android.yml`
replace-requirement ubiquitous 2: The Android app shall expose to the page only connecting to a hub (from its connect screen alone), reading the clipboard (from its connect screen alone), reading a QR code with Google Play's code scanner (from its connect screen alone), the hub's address, the app's version, changing the hub, saving a text file to Downloads, showing a notification, the notification permission, keeping connected in the background, the battery settings, the phone's dictation and the phone's voice.
replace-requirement event 9: When the user gives a pairing code with the address, or scans the computer's QR code (a link `<address>#pair=<code>`), the Android app shall trade the code for the hub's token through `POST /api/v1/pairing/claim` and sign in with it, or say why it was refused.
replace-requirement event 10: When another app shares text with Orbis, the Android app shall connect if the text holds a sign-in link (`…#token=…`) or a pairing link (`…#pair=…`), and otherwise hand the text to the web app, which puts it in the message box of the next conversation opened.
append-requirement unwanted: The Android app shall not ask for the camera permission: the QR code is read on Google Play's own scanner screen, and a phone without it is told to type the address and the code.
append-criterion [verified] A pairing link gives its hub and its six-digit code, inside shared text too, and a link with no code, a short code or another scheme is no pairing link — verified by `packages/android/app/src/test/java/app/orbis/android/HubTest.java`.
append-criterion [verified] In a real browser, the connect screen's Scan QR code connects with the address and the code of the computer's QR code, says when a QR code is not Orbis's or the phone has no scanner, and does nothing when the scan is cancelled — verified by `tests/e2e/android-connect.test.ts`.
```
