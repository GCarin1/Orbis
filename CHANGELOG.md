# Changelog

All notable changes to Orbis are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/). Each entry names the Doctrina
change that delivered it.

## [Unreleased]

### Fixed

- Review of the audits (change 0028-review-of-the-audits): on Windows,
  commands with quotes (`mkdir "Nova Pasta"`) work in `computer.shell` and the
  UTF-16 files PowerShell writes can be read; a resumed Claude Code / Codex
  session sees what colleagues wrote during its last run; facts are no
  longer pushed out of the context by summaries; "não", "está" and "você" no
  longer match every memory; a routine's draft-only test cannot be re-run
  outside its routine; the chat's "new below" counts messages only and keeps
  the steps already shown when a conversation reloads.
- Audit cycle 5 (change 0027-audit-cycle-5-performance-and-sweep): long runs no longer block the hub
  (steps are written every 250 ms instead of on every step), the database
  indexes what every run looks up (migration 8), a retried run stays in its
  chain, the chat stays fast during long runs, and the send error clears
  when you edit the message.
- Audit cycle 4 (change 0026-audit-cycle-4-mcp-and-apis): a connected MCP
  server with a long name no longer makes every reply of its bots fail (tool
  names stay within 52 characters on the wire); an HTTP server that ended its
  session is reconnected; stopping a bot stops waiting on its MCP call;
  `/v1/chat/completions` answers 400 instead of crashing when no run starts;
  `orbis chat` follows only its own message's work.
- Audit cycle 3 (change 0025-audit-cycle-3-computer-tools): on Windows,
  accents in command output arrive intact (cmd.exe switched to UTF-8) and
  npm, git and python run in a bot's isolated computer (APPDATA, TEMP and a
  profile of its own); reading a missing, binary or huge file gets a plain
  answer; `browser.snapshot` reads long pages in parts.
- Audit cycle 2 (change 0024-audit-cycle-2-web-app-state): the app finds a
  connection that went quiet (after sleep or a Wi-Fi drop) and reconnects
  instead of showing "connected" while replies never arrive; a refused
  approval or draft answer says why; the approvals inbox says what each call
  would do and opens the right conversation; previews and reading aloud skip
  Markdown marks.
- Audit cycle 1 (change 0023-audit-cycle-1-routines-and-usage): a routine
  scheduled faster than its work skips a turn instead of piling runs up; a
  routine run cut by a restart shows how it ended; Codex token counts of
  its older output are no longer added up cumulatively.
- Chat and bot deep audit (change 0022-chat-and-bot-deep-audit; see the
  second round of `docs/bot-behaviour-audit.md`):
  - **Claude Code, Codex, Gemini and Cursor no longer stopped mid-approval**:
    their process had its own 15-minute clock, which kept running while you
    decided; only the run's clock (paused while it waits for you) counts now.
    The MCP bridge forwards tool calls side by side with no 5-minute cap on
    an answer, and Codex and the Gemini CLI wait 24 hours for an Orbis tool.
  - **A gone Codex thread failed every later message** of that conversation;
    Codex and Claude Code now start a new session with the whole recent
    conversation. Long prompts go on stdin (Windows caps a command line).
  - **Memory**: answers to mentions and reports leave no summary, the same
    summary is kept once (200 per bot), common words no longer match every
    summary, at most 3 summaries reach a context; the summaries the group
    loop left are removed (database migration 7).
  - **Context**: bots know today's date, answer in your language, know where
    they are and who is there; a long message is cut instead of dropping
    the whole history; other bots' failures stay out of it.
  - **Runs**: a bot working in two conversations stays busy; two approvals at
    once; runs and handoffs left waiting by a stopped hub are closed (no more
    endless "…"); a denied call can be asked again; LM Studio / Ollama /
    OpenAI-compatible brains retry 429 and 5xx, run tool calls a server ends
    with `stop`, and keep `<think>` out of the reply.

- Bot behaviour audit (change 0021-bot-behaviour-audit, ADR 0011; see
  `docs/bot-behaviour-audit.md`):
  - **Bots looping in a group**: a reply listing the team woke every bot it
    named, whose replies listed the team again. Runs now share a chain per
    message; a reply naming more than two bots wakes no one, a bot woken by a
    mention wakes no one, a bot does not answer the same message twice, and
    one message sets off at most `ORBIS_MAX_CHAIN_RUNS` (12) runs.
  - **Windows**: Claude Code 2 (`claude.CMD` pointing at `claude.exe`) and
    MCP servers started with `npx` (Node 24's `npx.cmd`) start again; an MCP
    server that stops says why instead of `} Node.js v24`; the browser uses
    the installed Chrome or Edge when Playwright's Chromium is missing; bots
    know they are on Windows and that commands run in cmd.exe.
  - **Limits**: the time limit counts work, not the time waiting for your
    approval; an API brain's last step answers instead of calling tools; a
    third identical tool call is refused; an unreachable LM Studio / Ollama
    server or a brain with no API key says what to fix; bots start idle
    after a restart.

### Added

- `chat-http` reads the chats' history (change 0030-chat-http-history): when
  an answer holds no readable text the reply comes from the chat's history,
  and when it names no chat the bot finds its own among the newest (never one
  you have open); pasting a history cURL renews the token.
- `chat-http` brain (change 0029-chat-http-brain): bots can use a chat API you
  reach from the browser with a Bearer token (a `multipart/form-data` request
  with a `data` field, as "Copy as cURL" shows). Give the request's address and
  token in the bot's settings — or paste the cURL and press **Fill in from the
  cURL**. The token is the bot's encrypted secret; the address is never in
  Orbis's code nor in exported templates. Expired tokens are reported before
  calling; streamed answers in the usual formats are read; the server's chat
  is continued; tools work through ```tool blocks.

- Chat: Markdown messages (lists, code with Copy, tables, links), one bubble
  per busy bot with **■ Stop** and its queue, "waiting for you" during an
  approval, **Try again** on a failed run (`POST /api/v1/runs/:id/retry`),
  **Load earlier messages**, scrolling that keeps your place with a "new
  below" button, and a send error that keeps your text.

- `skills.create`: a bot writes a skill for itself or a colleague (asks
  first).

- ChatGPT through Codex (change 0019-chatgpt-through-codex): **Settings →
  Brains → ChatGPT with your subscription** installs the Codex CLI
  (`npm install -g @openai/codex`), signs in with the ChatGPT account in the
  browser (`codex login`) or with a code on any device (`codex login
  --device-auth`), shows the account, tests it and signs out; routes under
  `/api/v1/runtimes/codex/`. The `codex` brain is labelled "Codex CLI (your
  ChatGPT account, no API)".

- Tools marketplace (change 0018-mcp-marketplace, ADR 0010): the hub is now
  also an MCP client. **🧩 Tools** lists 17 checked MCP servers — no account
  (DeepWiki, Exa, Context7, Hugging Face, Sequential Thinking, Playwright,
  Filesystem), sign in with your account through OAuth with dynamic client
  registration and PKCE (Notion, Linear, Jira & Confluence, Sentry,
  Supabase, Canva), or a key (GitHub, Brave Search, Tavily, Firecrawl) —
  plus custom servers (a program or an address). Keys and sign-ins are hub
  secrets; tools become `mcp.<server>.<tool>`, go through the policy and
  approvals (tools that are not read-only ask first) and reach only the bots
  you tick. Bot settings choose tools with switches; allowlists gain `!`
  exclusions, and `*` covers Orbis's own tools only. Routes under
  `/api/v1/mcp/`, `/api/v1/tools`, `/oauth/mcp/callback`; stream events
  `mcp.updated`, `mcp.deleted`.

- Three kinds of computer (change 0017-computer-modes, ADR 0009): besides a
  private folder and a Docker container, a bot can work on **your own
  computer** (`provider: "host"`) in a folder you choose, with your programs
  and environment minus Orbis's variables, file tools confined to that
  folder, a visible browser window (your Chrome or Edge) and file writes
  that ask first; the app asks for your consent once per bot and templates
  never carry it. Bot settings show three cards; **Settings → Computers** and
  `GET /api/v1/computers` say what Docker needs, and **Prepare image**
  (`POST /api/v1/computers/docker/image`) builds `orbis/desktop`. Each bot is
  told which computer it has.

- Voice and theme (change 0016-voice-and-theme): a microphone in the
  message box — the browser's dictation in Chrome and Edge, and elsewhere
  (the desktop app, Firefox) a recording the hub sends to any
  OpenAI-compatible transcription service (OpenAI, Groq, a local Whisper),
  set in the new **Settings → Voice and appearance** tab or with
  `ORBIS_TRANSCRIBE_URL`, `ORBIS_TRANSCRIBE_MODEL`, `ORBIS_TRANSCRIBE_API_KEY`
  (the key kept encrypted); `/api/v1/voice` routes; a Listen button on bot
  messages and a switch that reads new replies aloud with the system's
  voices; a System/Light/Dark theme switch, remembered; the desktop app lets
  the page use the microphone (audio only).

- The Orbis look (change 0015-orbis-look): bots have faces — eight shapes
  (the Orbis orb with its orbit ring, blob, square, pill, triangle, hexagon,
  cloud, drop) in ten colors with two eyes that move with the bot's state —
  and a mascot. The web app is laid out like a chat with your team: search
  and one list of bots and groups with unread dots, a thin header of icon
  buttons, dark and light bubbles with time separators, "Messages from …"
  when colleagues speak in a bot's conversation, mentions in each bot's
  color, a pill composer, a side panel with the bot's screen, routines in
  words, team and brain, a new-bot screen with a color and shape picker and
  suggestions, dark mode and a phone layout. `avatarShape` on bots and
  templates.

- A team with a hierarchy (change 0014-team-hierarchy): each bot can report to
  a manager (`reportsTo`, `--reports-to`), and every bot's prompt names its
  manager, reports and colleagues. Everything a bot hands off in one run comes
  back to it together once all of it has ended: it runs once more (trigger
  `report`) and tells the user the outcome on its own, with a `bot.report`
  stream event and a desktop notification. Mentions name a handle or a role
  (`@qa`, `@designer`); a bot's reply that mentions colleagues brings them into
  that conversation, so bots talk to each other without the user relaying.

- Brains you can see and test (change 0013-brains-settings): the web app's
  ⚙ Settings screen lists the brains on the hub's machine (Claude Code,
  Codex, Gemini CLI, Cursor, Ollama, LM Studio: installed or running, version,
  models, how to install) and each bot's brain, with a **Test** button that
  asks `17 × 23` with no tools and shows the reply (a model answers 391; the
  mock only echoes); the conversation header shows the open bot's brain and
  model. New brains: `cursor` (Cursor CLI with your Cursor login, chat
  resume, Orbis tools over MCP), `ollama` and `lmstudio` (local models at
  `ORBIS_OLLAMA_URL` / `ORBIS_LMSTUDIO_URL`, no key, model suggestions); a
  local model that rejects tools answers without them. `GET
  /api/v1/runtimes/local`, `POST /api/v1/runtimes/test`,
  `orbis runtimes test <kind>|@bot`.

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

### Changed

- `team.handoff` reports back by default (`returnResult` defaults to true) and
  accepts a role one bot holds; a mention in a group runs the bot even when it
  is not a member; `ORBIS_MAX_HANDOFF_DEPTH` defaults to 6 (change
  0014-team-hierarchy).

### Fixed

- Windows: CLI brains installed with `npm i -g` (`claude.cmd`, `codex.cmd`,
  `gemini.cmd`) run through the Node.js script the `.cmd` file points to;
  Node.js refused to start them directly (change 0013-brains-settings).
- Composer autocomplete (change 0012-composer-caret): keys typed right after
  picking an `@mention` or `/skill` suggestion stay where they were typed;
  the caret is placed in the same render as the picked text instead of a
  later animation frame.
- Clean checkout (change 0011-clean-checkout): installing the workspace
  compiles the TypeScript packages (`prepare` scripts), so a fresh clone
  runs the tests and the CLI without a separate build.
