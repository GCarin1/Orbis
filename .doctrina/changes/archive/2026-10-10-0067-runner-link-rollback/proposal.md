# Change 0067-runner-link-rollback — runner-link-rollback

- **Status:** applied
- **Applied:** 2026-10-10
- **Date:** 2026-10-10
- **Owner:** Orbis maintainers
- **Lane:** runtime (confident; signals: runner) — opened as chore
- **Affects specs:** (none — chore)

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

On the first real link, the account kept two active devices for one phone.
A device registered in the cloud that this hub then fails to keep would stay
active there, unused, with a token nobody holds (ADR 0023).

## What

- `packages/hub/src/sync/service.ts`: when keeping the device here fails after
  `register_device`, the hub calls `device_unlink` with the new token and
  forgets it, then reports the error.
- `packages/hub/test/sync.test.ts`: the rollback, and linking again
  afterwards.

## Scope boundaries

- The two devices already in the account are revoked by the user from
  Settings → Account.

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
