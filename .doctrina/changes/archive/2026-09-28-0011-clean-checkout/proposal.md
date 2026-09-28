# Change 0011-clean-checkout — clean-checkout

- **Status:** applied
- **Applied:** 2026-09-28
- **Date:** 2026-09-27
- **Owner:** Claude Code
- **Lane:** product (confident; signals: build) — opened as chore
- **Affects specs:** (none — chore)

## Why

A fresh clone could not run the tests or the CLI straight after installing:
the workspace packages point their entries at `dist/`, which only a build
creates, so tests importing `@orbis/shared` or `@orbis/hub` failed on a
clean checkout until `npm run build` ran (flagged by `doctrina doctor`).

## What

- `packages/shared`, `packages/hub`, `packages/cli` and `packages/desktop`
  gain a `prepare` script (`tsc -b`), so installing the workspace compiles
  the TypeScript packages in dependency order.
- README quick start notes that installing already builds the packages.

## Scope boundaries

- The web app is still built by `npm run build` (Vite); its tests run from
  source.
- No behaviour, spec, contract or API change.

## Verification

- [x] Automated checks pass from a clean tree (`doctrina verify --clean`).
- [x] A fresh clone installs with `npm ci`, builds every TypeScript package and runs the test suite without a separate build step.

## Open questions

- None.
