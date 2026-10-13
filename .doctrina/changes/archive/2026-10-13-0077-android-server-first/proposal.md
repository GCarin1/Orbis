# Change 0077-android-server-first — android-server-first

- **Status:** applied
- **Applied:** 2026-10-13
- **Date:** 2026-10-13
- **Owner:**
- **Lane:** product (uncertain)
- **Affects specs:** android-app

<!--
Optional, and usually absent. The closing docs gate reads COMMAND and FLAG
names out of the prose below and asks for documentation when it finds any.
It cannot tell a change from a mention: explaining an effect, or writing a
Scope boundaries line about what this deliberately does NOT touch, names
things just as loudly as changing them would.

When that happens, say so on the record instead of forcing the close:

- **Documented surface:** n/a — names two commands to explain an effect; alters neither

`none` reads the same as `n/a`, and a BARE one silences nothing — the
reason is the declaration.
-->

## Why

The new app opened on "📱 Orbis neste celular" and asked for the Termux permission. Its saved hub was still the
one on the phone, from the Termux days, so it went to Termux first. The user no longer uses Termux: the hub runs
on the Umbrel (ADR 0026, ADR 0027).

## What

- `packages/android/app/src/main/assets/connect.html`:
  - "Conectar ao seu Orbis" comes first and is always open, with a `*.ts.net` placeholder and steps for
    Tailscale and the account's sign-in;
  - Orbis on this phone moves into a closed advanced `<details>`.
- `MainActivity.java`: a saved local hub no longer starts Termux when the app opens. Termux starts again by
  itself only when the hub on this phone was lost while in use.
- `tests/e2e/android-connect.test.ts`, the `android-app` delta, `docs/umbrel.md` and the CHANGELOG.

## Scope boundaries

Termux support stays (the scripts, the bridge, pairing). Only what the app shows first and what it starts by itself change.

## Verification

<!--
How you will know the change is correctly applied. Use checkboxes: every
box here is a claim that must be PROVEN before the change is done.
`doctrina change archive` refuses to archive while any box below is
unchecked (pass --force to archive anyway and record the gap). Distinguish
"task marked done" from "verification passed" — link the evidence.
-->

- [x] Automated checks pass (`doctrina verify`).
- [x] The affected spec's acceptance criteria are met and cite their evidence: `tests/e2e/android-connect.test.ts`.

## Open questions

<!-- List unresolved decisions. Empty if none. -->
