# ADR 0001 — TypeScript monorepo on Node.js 22 with npm workspaces

- **Status:** accepted
- **Date:** 2026-09-27
- **Deciders:** project owner (stack choice delegated in the intake), Claude Code
- **Supersedes:** —
- **Superseded by:** —
- **Evidence:** n/a — no implementation yet; land with the walking skeleton
- **Landed:** —

## Context

The owner delegated the stack ("utilize o que for mais eficiente para o
trabalho") and asked for a web mode, an app mode, a CLI and an API. The same
domain types travel between the hub, the web app, the desktop app, the CLI
and the MCP bridge. Doctrina itself runs on Node.js, and the agent CLIs Orbis
drives (Claude Code, Codex, Gemini CLI) are distributed through npm, so every
Orbis user already has Node.js installed.

## Decision

Orbis is one TypeScript repository on Node.js 22.12 or later, split into npm
workspaces under `packages/`: `shared` (types, schemas, event names), `hub`
(the server), `cli` (the `orbis` command), `web` (React + Vite) and
`desktop` (Electron). Server-side packages compile with `tsc` to ESM;
tests run with Vitest; one root `npm run check` runs typecheck, tests and
build and is what `doctrina verify` executes.

## Alternatives considered

1. Python (FastAPI) for the hub, as the research suggested — rejected: a
   second language for the same types, and the web/desktop/CLI would still
   be TypeScript; the owner does not require Python.
2. Go or Rust for the hub — rejected: faster binaries, but no shared types
   with the front-ends and slower iteration for a one-person project.
3. pnpm or a Turborepo setup — rejected for now: npm workspaces ship with
   Node.js and need no extra install.

## Consequences

**Positive**

- One language and one type system end to end; request and event shapes are
  imported, not copied.
- `npm install` is the only setup step.

**Negative**

- Node.js is single-threaded: CPU-heavy work (none planned) would need
  worker threads.

**Neutral**

- The desktop app bundles the same `hub` package instead of a separate binary.
