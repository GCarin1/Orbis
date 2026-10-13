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
replace-requirement event 13: When the user taps Open Orbis in the connect screen's advanced choice, or the hub on this phone stops answering while it is open, the Android app shall find the hub on 127.0.0.1:7420 taking its own token, or ask Termux to run `orbis-phone serve` with that token on its standard input, wait up to three minutes saying for how long so far, and open the web app signed in, with no pairing and no sign-in.
append-requirement event: When the app starts, even with the hub on this phone saved, the Android app shall show its connect screen with the address of your Orbis first and open, and Orbis on this phone as a closed advanced choice that does not start Termux nor ask for its permission by itself.
set-criterion 14: verified
append-criterion [verified] In a real browser, the first screen leads with "Connect to your Orbis" open, an address placeholder on a tailnet, and steps for Tailscale and the account's sign-in; Orbis on this phone is a closed advanced choice, absent from an app without it, that asks nothing until opened, and starts by itself only when the hub on this phone was lost while in use — verified by `tests/e2e/android-connect.test.ts`
```
