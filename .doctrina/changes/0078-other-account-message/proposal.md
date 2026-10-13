# Change 0078-other-account-message — other-account-message

- **Status:** applied
- **Applied:** 2026-10-13
- **Date:** 2026-10-13
- **Owner:**
- **Lane:** product (uncertain)
- **Affects specs:** hub-api

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

A second person signed in on another phone to `orbis-01`, which the first account already owns (ADR 0029). The
password held, the hub answered 401, and the app went back to the sign-in screen with no reason.

## What

- Hub (`packages/hub/src/auth/account.ts`): a valid, confirmed session of another account gets 403
  `other_account`. It still counts toward the refusal limit.
- Web:
  - `hubAccepts()` in `packages/web/src/account.ts` asks `GET /api/v1/account` with the new session before
    keeping it;
  - the sign-in screen (`TokenGate.tsx`) says "This Orbis already belongs to another account…", with pt and en
    texts.
- Tests in `auth.test.ts` and `account.test.tsx`, the contract and the CHANGELOG.

## Scope boundaries

Who may open a hub does not change (ADR 0029).

## Verification

<!--
How you will know the change is correctly applied. Use checkboxes: every
box here is a claim that must be PROVEN before the change is done.
`doctrina change archive` refuses to archive while any box below is
unchecked (pass --force to archive anyway and record the gap). Distinguish
"task marked done" from "verification passed" — link the evidence.
-->

- [x] Automated checks pass (`doctrina verify`).
- [x] The affected spec's acceptance criteria are met and cite their evidence: `packages/hub/test/auth.test.ts`, `packages/web/test/account.test.tsx`.

## Open questions

<!-- List unresolved decisions. Empty if none. -->
