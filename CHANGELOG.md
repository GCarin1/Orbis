# Changelog

All notable changes to Orbis are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/). Each entry names the Doctrina
change that delivered it.

## [Unreleased]

### Added

- Desktop app (change 0010-desktop-app; lands ADR 0007): `packages/desktop`,
  an Electron shell that uses the hub answering `/health` at its configured
  URL or starts the bundled hub with Node.js and waits for it, loads the web
  app in a window with context isolation, no Node integration and the
  sandbox (other origins open in the browser), raises one native
  notification per approval or secret request (a click opens the
  conversation) and stays in the tray. `npm run desktop`.

- Templates and bot settings (change 0009-templates-and-settings):
  `GET /api/v1/bots/:id/export` writes a `BotTemplate` YAML (identity,
  brain without credentials, policy, computer, allowlists, the bot's own
  skills, routines; never memory, history or secrets) after a secret scan
  that names each suspicious line; `POST /api/v1/bots/import` creates a new
  bot with its routines disabled; `orbis bots export|import`; the web bot
  settings panel (identity, brain, policy rules and grants, computer,
  allowlists, spend cap, export, duplicate, delete) and template import in
  the new-bot dialog.

- Secrets and usage (change 0008-secrets-and-usage; lands ADR 0008):
  - Per-bot AES-256-GCM vault (ORBIS_MASTER_KEY or a generated 0600
    `master.key`, bot and name authenticated with each value), REST routes,
    `{{secret:NAME}}` resolved inside the tool gateway for acting tools
    only, `••••` redaction in tool results, run steps, replies, bot timeline
    items and approval cards, `secret.request` cards with a masked field.
  - Usage report per bot and account (`GET /api/v1/usage`), the price
    table overridable with `prices.json`, spend caps that refuse a run at
    the cap and stop one that crosses it, subscription cost outside caps by
    default.
  - CLI `orbis secrets` (hidden prompt or stdin) and `orbis usage`; web
    secret-request card and usage screen.

- Skills and routines (change 0007-skills-and-routines):
  - Skills as SKILL.md files at account and bot scope with REST routes,
    the offered list in every run's context, `skills.list` / `skills.read`,
    `/name` invocation (a `skill.unavailable` event for one a bot is not
    offered), and Claude Code's `.claude/skills/` kept in sync.
  - Routines: cron in an IANA timezone, webhooks signed with
    `X-Orbis-Signature` or GitHub's `X-Hub-Signature-256`, draft-only test
    runs (external tools become draft cards), enable after a passing test,
    last 20 runs, 50 per bot, absence pause, routine cards,
    `routine.create` (asks first) and `routine.list`.
  - CLI `orbis skills` and `orbis routines`; web `/` autocomplete, skills
    screen, routines panel and routine cards.

- Orbis brand (change 0006-brand): the planet-and-orbit mark with its
  cyan-to-violet gradient, one-colour and app-icon versions, dark and light
  logos with the tagline "Open Source Autonomous AI Agents", PWA icons, a
  social preview and a brand guide in `docs/brand/` (`npm run brand:icons`
  renders the PNGs). The web app uses the new favicon, icons, wordmark and
  colours; the READMEs open with the logo.

- One computer per bot (change 0005-computer; lands ADR 0005):
  - Provider interface with the `local` provider (child processes in the
    bot's workspace, scrubbed environment with the bot's own HOME,
    process-group kill on timeout, 64 KiB output cap) and the `docker`
    provider (one `orbis/desktop` container and one home volume per bot,
    workspace bind-mounted, CPU and memory limits, noVNC and DevTools on
    127.0.0.1) over an injectable command runner; `docker/desktop` image.
  - Start on demand, hibernation after `hibernateAfterMin`, destroy on
    delete, takeover that holds the bot's tool calls, `computer.updated`.
  - Tools `computer.shell` (asks by default), `computer.read_file`,
    `computer.write_file`, `computer.list_files` confined to the workspace
    (symlinks included); `browser.open|snapshot|click|type|press|screenshot|close`
    on Playwright with a per-bot profile, text snapshots with references,
    takeover requests on password, CAPTCHA and verification pages.
  - REST: computer status, start, stop, takeover, release, screenshot and the
    noVNC proxy behind a path-scoped cookie.
  - Web: computer side panel and full screen with the live screenshot or
    noVNC, Take over / Hand back.
  - `ORBIS_BROWSER_EXECUTABLE` and `ORBIS_DOCKER`.
- Collaboration (change 0004-collaboration):
  - Group conversations of 2 to 6 bots with a lead: `POST /api/v1/conversations`,
    `PATCH|DELETE /api/v1/conversations/:id`, members routes, the
    `conversation.deleted` stream event. A message runs the mentioned members,
    every member for `@everyone`, or the lead; bot replies that mention
    members start their runs.
  - `team.handoff`: asynchronous, with a handoff card (`queued`, `running`,
    `done`, `failed`), the receiver's reply threaded under it, no foreign
    history, optional `returnResult`; a chain depth limit
    (`ORBIS_MAX_HANDOFF_DEPTH`, default 4) with a `handoff.depth_exceeded`
    event.
  - Memory per bot and per team: `memory.save` and `memory.search` tools, a
    run summary after each successful run, REST routes to list, add, edit and
    delete entries.
  - CLI: `orbis group list|create|chat|add|remove|delete`,
    `orbis memory list|add|edit|rm`; `orbis chat` follows handoffs.
  - Web: groups in the sidebar, group creation dialog, group header with
    members and lead, handoff cards, threaded replies, `@` autocomplete.
- API and CLI brains (change 0003-api-and-cli-brains):
  - `anthropic` brain on the official `@anthropic-ai/sdk`: streaming tool loop
    through the gateway, `claude-opus-5` default, adaptive thinking, prompt
    caching, server-side refusal fallback on first-party Opus 5 / Opus 5.5 /
    Fable 5.1, refusal and truncated-tool-call handling, usage and cost.
  - `openai` brain for any OpenAI-compatible server (OpenAI, OpenRouter,
    Ollama, LM Studio, vLLM) with streamed function calling; no key on
    localhost.
  - `codex` (ChatGPT subscription, thread resume) and `gemini-cli` (Google
    account, workspace MCP settings restored after each run) brains.
  - `GET /api/v1/runtimes/health` and `orbis runtimes check`.
  - OpenAI-compatible `GET /v1/models` and `POST /v1/chat/completions`
    (JSON and server-sent events) with `orbis:<handle>` models.
  - Web: base URL field for API brains.
- Tool gateway and approvals (change 0002-tool-gateway-and-approvals):
  - One account-level tool registry with JSON Schema validation, risk
    classes, a per-bot allowlist (`Bot.tools`), the 20,000-character result
    cap and `<untrusted-content>` envelopes; tools `team.list_bots`,
    `conversation.post`, `draft.create` and `http.fetch` (GET/HEAD).
  - MCP endpoint `POST /mcp` with per-run tokens and the stdio bridge
    (`orbis mcp`, `dist/mcp-bridge.js`); Claude Code bots get the Orbis tools
    and `--permission-prompt-tool mcp__orbis__approval_prompt`.
  - Deterministic policy (locked deny → locked ask → grants → rules →
    default), approval cards with allow once / always / deny, expiry when the
    run ends, `GET/POST /api/v1/approvals`.
  - Drafts with editable fields, Send (webhook POST or `outbox.jsonl`) and
    Discard; `POST /api/v1/cards/:id/send|discard`.
  - CLI: inline approvals in `orbis chat`, `orbis approvals`, `orbis mcp`.
  - Web: approval and draft cards, approvals inbox.
- Walking skeleton (change 0001-walking-skeleton):
  - Hub with SQLite storage, REST API under `/api/v1`, WebSocket stream,
    OpenAPI document, bearer-token auth and the web app served at `/`.
  - Bots with handle, role, durable description, avatar, brain, policy,
    computer configuration, skills allowlist and spend cap; pin, hide,
    duplicate and delete with full cascade and workspace destruction.
  - Direct conversations with one timeline, thread replies, reactions and a
    FIFO run queue per bot and conversation; bot states with live events.
  - Brains: `mock`, `claude-code` (headless Claude Code on your subscription,
    with session resume) and `custom-cli`; scrubbed environment for every
    CLI brain.
  - Context assembly within the contract budgets (30 items, 12,000
    characters, 8 relevant memories plus every preference).
  - `orbis` CLI: `serve`, `open`, `login`, `bots`, `chat`.
  - Web app: roster with state rings and labels, timeline with collapsible
    run steps, composer, bot creation, pt-BR and English, installable PWA.
