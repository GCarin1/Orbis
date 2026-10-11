# Change 0071-umbrel-home — umbrel-home

- **Status:** applied
- **Applied:** 2026-10-11
- **Date:** 2026-10-11
- **Owner:** Claude Code (requested by the project owner: an UmbrelOS box at home, nothing exposed, one account per person, background and notifications)
- **Lane:** product
- **Affects specs:** cloud

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

The free Oracle VM had no capacity. The owner has an UmbrelOS box at home (4 GB) and wants Orbis to run there
for each person of the house, with nothing exposed to the internet, the bots in the background and
notifications on the phone, and without Termux.

## What

- `deploy/umbrel/docker-compose.yml`: one stack per person, deployed with Portainer. It holds the hub (the
  published image, its own volume, a memory ceiling, no port) and its own `tailscale/tailscale` node, which
  serves `https://orbis-<name>.<tailnet>.ts.net` to the hub.
- `.github/workflows/server-image.yml` publishes `ghcr.io/<owner>/orbis:latest` for amd64 and arm64.
- `docs/umbrel.md`:
  - Tailscale, Portainer, one stack per person;
  - the first sign-in, the account and two-step verification;
  - the phone: always-on VPN, notifications, voice;
  - the data from the phone, updates, and how it is protected.
- ADR 0027, a `cloud` delta, and the CHANGELOG.

## Scope boundaries

- The hub stays single-account: people are separated by containers.
- No change to the Android app. Its existing foreground connection carries the notifications.
- The owner does the Tailscale account, the Portainer install and making the image public.

## Verification

- [x] Automated checks pass (`doctrina verify`, or the project's typecheck/test/build).
- [x] The affected spec's acceptance criteria are met and cite their evidence (`doctrina coverage`).
- [x] `docker compose config` renders the stack with a sample person: their own volumes (`orbis-gabriel_*`),
  their address, the serve JSON; and refuses a stack without its variables.

## Open questions

<!-- List unresolved decisions. Empty if none. -->
