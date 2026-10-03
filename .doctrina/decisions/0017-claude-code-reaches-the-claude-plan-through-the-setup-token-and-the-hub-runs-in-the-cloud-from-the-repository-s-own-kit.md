# ADR 0017 — Claude Code reaches the Claude plan through the setup-token and the hub runs in the cloud from the repository's own kit

- **Status:** accepted
- **Scope:** agent-runtimes, secrets, hub-api, web-app
- **Date:** 2026-10-03
- **Deciders:** project owner (requirement: "acessar o meu Orbis pelo celular… conectar o Claude Code ou a minha conta Claude… gastando o meu recurso semanal ou diário de requests, em vez de usar a API… sem estar na mesma rede… sem depender do meu computador estar ligado… que não seja por meio de API"), Claude Code
- **Supersedes:** —
- **Superseded by:** —
- **Evidence:** `packages/hub/src/secrets/claude-token.ts`, `packages/hub/src/brains/claude-code.ts`, `Dockerfile`, `deploy/docker-compose.yml`, `.devcontainer/devcontainer.json`
- **Landed:** —

## Context

The `claude-code` brain runs the `claude` program with its own sign-in
(ADR 0003), which spends the user's Claude plan and not the API. That sign-in
lives on the computer that runs the hub, so Orbis works only while that
computer is on, and the phone reaches it only on the same network.

The owner wants:

- Orbis on the phone anywhere, with the computer off.
- The Claude plan's limits, never API credits.

Claude Code has a supported way to run on a plan away from an interactive
sign-in. `claude setup-token` prints a token for the plan that lasts one year
and needs a Pro, Max, Team or Enterprise plan. Claude Code reads it from
`CLAUDE_CODE_OAUTH_TOKEN`. In Claude Code's order of credentials,
`ANTHROPIC_AUTH_TOKEN` and `ANTHROPIC_API_KEY` come before this token, and
those two bill the API.

The repository had no way to run the hub on a server: no image and no
deployment files.

## Decision

- **The plan through Claude Code, by its token.**
  - The user pastes the token `claude setup-token` prints in Settings →
    Brains → Claude Code, or sets `CLAUDE_CODE_OAUTH_TOKEN` in the hub's
    environment. The saved one wins.
  - The hub keeps it as a hub secret, encrypted with the vault's key. The
    API answers only its status: saved, where from, since when, and until
    about when (one year).
  - Only Claude Code gets it, as `CLAUDE_CODE_OAUTH_TOKEN`: in runs, in the
    brain test and in `claude auth status`. It is not passed to the sign-in
    (`claude auth login` makes a login of its own).
  - A bot secret of that name comes first, which gives that bot another
    account.
- **Never the API on this path.**
  - Claude Code's environment never carries `ANTHROPIC_API_KEY` or
    `ANTHROPIC_AUTH_TOKEN`.
  - A pasted API key (`sk-ant-api…`) is refused.
  - The other brains and the bots' commands never get the token: the
    harness environment's passthrough list and the host computer's filter
    keep it out. It is masked like the shared chat tokens.
- **Orbis never speaks to the Claude API with the plan's token.** It only
  hands the token to the `claude` program, which is what the token is for.
- **The cloud from the repository's own kit; the hub is unchanged.**
  - A `Dockerfile`:
    - the hub, the web app, Claude Code and Chromium;
    - `ORBIS_HOST=0.0.0.0` and data in `/data`, with
      `CLAUDE_CONFIG_DIR=/data/claude`, so that Claude Code's sign-in and
      sessions survive an update;
    - it runs as the `node` user.
  - `deploy/docker-compose.yml`:
    - the port on the machine's own address only;
    - optional Cloudflare tunnels as profiles: a quick tunnel with no
      account, or the user's own tunnel.
  - A `.devcontainer` for GitHub Codespaces:
    - it builds and starts the hub;
    - it keeps the data outside the repository folder;
    - it asks for `ORBIS_TOKEN` and `CLAUDE_CODE_OAUTH_TOKEN` as Codespaces
      secrets.
  - Reaching the hub from the internet relies on the hub's existing bearer
    token and pairing limits. No new authentication.

## Alternatives considered

1. **Call the Claude API with the plan's token from Orbis.** Rejected: the
   token is for Claude Code. Using it from another client is outside its
   intended use, and a change on Anthropic's side would break it silently.
2. **Only the interactive sign-in (`claude auth login`) on the server.** It
   still works (the page and code flow works from any device). But its
   tokens refresh in Claude Code's folder and expire when unused, and a
   headless server is the place a one-year token is made for.
3. **A hosted Orbis service.** Rejected: Orbis is self-hosted, and the
   plan's token is for one person's own use.
4. **Pass `CLAUDE_CODE_OAUTH_TOKEN` through the general passthrough list.**
   Rejected: every CLI brain and custom command would get it.
5. **A paid always-on host as the only option.** Codespaces' free hours let
   the owner try it at no cost, and the same image runs on a free VM.

## Consequences

**Positive**

- `claude-code` bots run on the plan from a Codespace or a server, so the
  phone reaches Orbis anywhere with the computer off.
- No path in Orbis can bill the API through Claude Code.
- One image and one compose file serve any Linux host, x86 or ARM.

**Negative**

- The plan's limits are shared with claude.ai and with Claude Code
  elsewhere. Busy bots use them up faster.
- The token must be renewed once a year.
- A hub on the internet relies on one bearer token. A long `ORBIS_TOKEN`
  matters more there.
- A Codespace stops when idle, and routines do not run while it is stopped.

**Neutral**

- The quick tunnel's address changes when it restarts. A fixed address
  needs the user's own tunnel or Tailscale.

<!--
Once this ADR is accepted, do not edit it. To change the decision,
create a new ADR that supersedes this one and update the "Superseded by"
header above to point at the new ADR. Status transitions:
proposed -> accepted | rejected
accepted -> deprecated | superseded by NNNN
-->
