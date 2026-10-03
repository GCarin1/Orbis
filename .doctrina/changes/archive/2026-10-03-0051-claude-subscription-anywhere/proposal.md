# Change 0051-claude-subscription-anywhere — Orbis from anywhere, on the Claude plan

- **Status:** applied
- **Applied:** 2026-10-03
- **Date:** 2026-10-03
- **Owner:** Claude Code
- **Lane:** product
- **Affects specs:** agent-runtimes, secrets, web-app, hub-api
- **Documented surface:** n/a — documented in docs/cloud.md, docs/brains.md, docs/api.md, the READMEs, .env.example and CHANGELOG with this change

## Why

The owner asked to use Orbis from the phone anywhere, with the computer off,
and to have the bots spend the Claude plan's daily and weekly limits through
Claude Code instead of the API, which costs more.

Today the `claude-code` brain runs on the sign-in of the computer that runs
the hub, so Orbis needs that computer on and the phone on its network.

## What

- Hub:
  - `secrets/claude-token.ts`: the token `claude setup-token` prints.
    - It is cleaned from whatever was pasted, and an API key is refused.
    - It is saved as a hub secret, with the server's `CLAUDE_CODE_OAUTH_TOKEN`
      (config `claudeOauthToken`) as the fallback.
    - It is answered only as a status (saved, source, since when, until
      about when), and masked with the shared tokens.
  - The Claude Code adapter asks for `CLAUDE_CODE_OAUTH_TOKEN` through the
    secret resolvers: the bot's own secret first, then the hub's. It passes
    the token to the process. The refused-login hint names
    `claude setup-token` when the run had a token.
  - The brain test and `claude auth status` get the token too; the sign-in
    does not.
  - `PUT` and `DELETE /api/v1/runtimes/claude/token`.
  - The host computer's filter drops `CLAUDE_CODE_OAUTH_TOKEN` and
    `ANTHROPIC_AUTH_TOKEN`.
- Web:
  - Claude Code's card gains 🔑 Subscription token: status, help, a masked
    field, replace and remove.
  - A refused token asks for a new one.
  - Settings → Phone points to the cloud guide.
- Cloud kit:
  - `Dockerfile` and `.dockerignore`. The build and a real run were checked
    in Docker: health, the web app, the token status, and a `claude-code`
    run refused by Anthropic with the setup-token hint.
  - `deploy/docker-compose.yml` with quick-tunnel and tunnel profiles, and
    `deploy/.env.example`.
  - `.devcontainer/` (devcontainer.json, start.sh), and `*.sh` kept LF.
- Product: SC13. Specs: deltas to `agent-runtimes`, `secrets`, `web-app`
  and `hub-api`. ADR 0017. Contracts `cli-harnesses` and `hub-surface`.
- Tests:
  - `packages/hub/test/runtimes/claude-token.test.ts`
  - `packages/hub/test/runtimes/claude-account.test.ts`
  - `packages/hub/test/cloud-kit.test.ts`
  - `packages/web/test/claude-sign-in.test.tsx`
  - `packages/web/test/android.test.tsx`
- Docs: `docs/cloud.md`, `docs/brains.md`, `docs/api.md`, the READMEs,
  `.env.example`, CHANGELOG.

## Scope boundaries

- Orbis does not call the Claude API with the plan's token. Only the
  `claude` program uses it.
- No hosted service, and no image published to a registry: the user builds
  from the repository.
- No new authentication for a hub on the internet: the bearer token and the
  pairing limits stay as they are.

## Verification

- [x] Automated checks pass: `npm run typecheck`, every Vitest project (the e2e included), `npm run build`.
- [x] The affected specs' acceptance criteria are met and cite their evidence (`doctrina coverage`).
- [x] The image builds, and a container serves the web app, refuses requests without the token, reports the server's token and runs Claude Code on it (manual, Docker 29).

## Open questions

None.
