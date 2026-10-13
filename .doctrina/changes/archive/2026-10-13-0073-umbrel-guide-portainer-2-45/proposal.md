# Change 0073-umbrel-guide-portainer-2-45 — Umbrel guide: Portainer 2.45 GitOps source and secure DNS tip

- **Status:** applied
- **Applied:** 2026-10-13
- **Date:** 2026-10-13
- **Owner:**
- **Lane:** product (uncertain) — opened as chore
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

The first real deploy on the user's Umbrel hit two problems the guide did not mention.

- Portainer 2.45 keeps a repository as a GitOps source. The URL typed into *Repository reference* failed with "reference not found".
- The browser's secure DNS hid the `.ts.net` name.

## What

`docs/umbrel.md` §3 now explains three things:

- the source with no authentication;
- the branch in *Repository reference*;
- the *Web editor* route with no Git.

§4 adds the secure DNS tip. The CHANGELOG records it.

## Scope boundaries

Only the docs change: the stack file and the image are unchanged.

## Verification

<!--
How you will know the change is correctly applied. Use checkboxes: every
box here is a claim that must be PROVEN before the change is done.
`doctrina change archive` refuses to archive while any box below is
unchecked (pass --force to archive anyway and record the gap). Distinguish
"task marked done" from "verification passed" — link the evidence.
-->

- [x] Automated checks pass: `npx vitest run --project hub packages/hub/test/cloud-kit.test.ts`.
- [x] The guide was followed on the real Umbrel: stack `orbis-01` healthy, sign-in screen at `https://orbis-01.<tailnet>.ts.net`.

## Open questions

<!-- List unresolved decisions. Empty if none. -->
