# Change 0069-server-runner — server-runner

- **Status:** applied
- **Applied:** 2026-10-11
- **Date:** 2026-10-11
- **Owner:** Claude Code (requested by the project owner: "A ideia é não precisar mais [do Termux]")
- **Lane:** runtime (confident; signals: runner, docker) — opened anyway (--force)
- **Affects specs:** cloud, cli

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

The user wants to stop depending on Termux. The bots need an always-on computer, which the Cloudflare
Worker is not. The user chose a free VM: Oracle Cloud Always Free.

## What

- `scripts/server/orbis-server.sh`: install, link, unlink, import, status, logs, update, stop and start for
  the hub in Docker on an always-on Linux server. `deploy/docker-compose.yml` and `deploy/.env.example`
  take `ORBIS_CLOUD_URL`.
- `orbis data export|import` (`packages/cli/src/commands/data.ts`): a hub's `.orbis` file moved straight to
  another hub.
- `packages/hub/src/relay/client.ts`: a hub replaced by another of its account gives way for good, and its
  link key now holds the cloud's address too.
- `.github/workflows/server-image.yml`: the image built for linux/arm64 and linux/amd64.
- `docs/server.md`, with links from `docs/cloud-migration.md`, `docs/cloud.md` and the Termux script.
- ADR 0025; deltas to `cloud` and `cli`; CHANGELOG.

## Scope boundaries

- No change to the Android app: it already opens a remote address, and starts Termux only for a hub at
  127.0.0.1.
- Cloudflare Containers and running the bots inside the cloud itself are out of scope.
- Creating the Oracle VM is the user's action, guided by `docs/server.md`.

## Verification

- [x] Automated checks pass (`doctrina verify`, or the project's typecheck/test/build).
- [x] The affected spec's acceptance criteria are met and cite their evidence (`doctrina coverage`).
- [x] `bash -n` on both scripts. The server script runs against stand-in Docker, git and installer in
  `server-script.test.ts`.

## Open questions

<!-- List unresolved decisions. Empty if none. -->
