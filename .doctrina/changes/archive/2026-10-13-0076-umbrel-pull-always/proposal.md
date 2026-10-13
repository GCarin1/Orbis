# Change 0076-umbrel-pull-always — umbrel-pull-always

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

After *Pull and redeploy* the Umbrel still ran the old image: Portainer showed the stack file's new commit, but the hub had not changed and still asked for the token.

## What

- `deploy/umbrel/docker-compose.yml`: `pull_policy: always` on the hub, with a test in `cloud-kit.test.ts`.
- `docs/umbrel.md`: how to tell an old image from an old browser cache, and how to recreate the container.
- CHANGELOG.

## Scope boundaries

The tailscale sidecar keeps its pinned version.

## Verification

<!--
How you will know the change is correctly applied. Use checkboxes: every
box here is a claim that must be PROVEN before the change is done.
`doctrina change archive` refuses to archive while any box below is
unchecked (pass --force to archive anyway and record the gap). Distinguish
"task marked done" from "verification passed" — link the evidence.
-->

- [x] Automated checks pass: `packages/hub/test/cloud-kit.test.ts`, and `docker compose config` keeps `pull_policy: always`.
- [x] No spec criterion changes (a chore).

## Open questions

<!-- List unresolved decisions. Empty if none. -->
