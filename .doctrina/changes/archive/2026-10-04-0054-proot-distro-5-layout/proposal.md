# Change 0054-proot-distro-5-layout — proot-distro 5 layout

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

Android: the install script finds Debian where proot-distro 5 keeps it (containers/<name>/rootfs), so a second run no longer stops at 'container already exists' and orbis-phone reaches the script

## What

On a real phone, proot-distro 5.9 keeps a distro in `containers/<name>/rootfs`; the script looked in
`installed-rootfs/<name>`, never found Debian, tried to install it again and stopped with "container 'debian'
already exists". The `orbis-phone` it wrote pointed at the old path too, so the app could not start the hub.
The script now asks where Debian is on each use, removes a copy that never finished, and `orbis-phone` looks in
both places each time it runs. Affects `scripts/android/orbis-termux.sh` and the `android-app` spec.

## Scope boundaries

The app and the hub are untouched. Phones that already ran the old script need to run the install command again.

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
