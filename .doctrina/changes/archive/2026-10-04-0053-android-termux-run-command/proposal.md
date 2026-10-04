# Change 0053-android-termux-run-command — Android: when Termux's RUN_COMMAND permission cannot be granted (it never shows), the app shows why, and Orbis still opens with no permission: 'orbis-phone open' starts the hub in Termux and hands the app its sign-in link

- **Status:** applied
- **Applied:** 2026-10-04
- **Date:** 2026-10-04
- **Owner:**
- **Lane:** product (uncertain)
- **Affects specs:**

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

Android: when Termux's RUN_COMMAND permission cannot be granted (it never shows), the app shows why, and Orbis still opens with no permission: 'orbis-phone open' starts the hub in Termux and hands the app its sign-in link

## What

On a real phone the permission "Run commands in Termux environment" did not show, in the app's settings or in a
dialog, so the app could not start the hub. Two changes:

- The first screen says what the system reports (Termux's version and where it came from, whether Termux declares
  the permission, whether the app asks for it, whether it is granted), so the cause is read, not guessed.
- Orbis works without the permission: `orbis-phone open`, run in Termux, starts the hub if it is stopped and opens
  the app with a sign-in link (the same shared-link door the computer's launcher uses). The app keeps the link's
  token as its own, so the next start finds the hub running and goes in at once.

Affects the `android-app` spec, `scripts/android/orbis-termux.sh`, `connect.html`, `MainActivity`, `LocalHub`.

## Scope boundaries

The app still starts the hub itself when the permission is granted (ADR 0018 stands). This only adds the way in
without it; it does not start the hub from the app when the permission is missing.

## Verification

<!--
How you will know the change is correctly applied. Use checkboxes: every
box here is a claim that must be PROVEN before the change is done.
`doctrina change archive` refuses to archive while any box below is
unchecked (pass --force to archive anyway and record the gap). Distinguish
"task marked done" from "verification passed" — link the evidence.
-->

- [x] Automated checks pass (`doctrina verify`, or the project's typecheck/test/build).
- [x] The affected spec's acceptance criteria are met and cite their evidence (`doctrina coverage`).

## Open questions

<!-- List unresolved decisions. Empty if none. -->
