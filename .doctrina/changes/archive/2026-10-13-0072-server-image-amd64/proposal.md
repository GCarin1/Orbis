# Change 0072-server-image-amd64 — server-image-amd64

- **Status:** applied
- **Applied:** 2026-10-13
- **Date:** 2026-10-13
- **Owner:** Claude Code (the project owner reported the failed *Server image* run)
- **Lane:** product (confident; signals: build) — opened as chore
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

The *Server image* run of `32bf8eb` failed in 32 s at the image's `npm ci … && npm run build` step (exit code
2). The same build had passed in 5m40s one commit before, with the same code and lockfile, and passes in a clean
local copy. The full log is not readable from this session. The owner's home server is an Intel i3-5005U
(amd64), so the emulated arm64 build, the slowest and most fragile part, is not needed by anyone today.

## What

- `.github/workflows/server-image.yml`:
  - builds and publishes linux/amd64 natively by default;
  - a `workflow_dispatch` input `arm64` adds linux/arm64, and QEMU is set up only then.
- `Dockerfile`: a failing `npm ci` prints the end of npm's debug log before it exits.
- `packages/hub/test/cloud-kit.test.ts`: the workflow test asks for amd64 always and arm64 only behind the
  input.
- `docs/umbrel.md` and the CHANGELOG.
- ADR 0027 said "amd64 and arm64". arm64 is now on demand, which changes no decision of it: a home server
  still compiles nothing.

- `packages/cli/test/audit-cycle4.test.ts` waits for the CLI's own run to exist instead of a fixed 200 ms. Under
  the full suite's load the fixed wait lost the race and the other run went first; the test passed alone 5/5.

## Scope boundaries

- No code change in the hub or the web app.

## Verification

- [x] Automated checks pass (`doctrina verify`, or the project's typecheck/test/build).
- [x] The image build's own steps pass in a clean copy of the repository (amd64, `npm ci` then `npm run build`).

## Open questions

<!-- List unresolved decisions. Empty if none. -->
