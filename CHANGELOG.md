# Changelog

All notable changes to Orbis are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/). Each entry names the Doctrina
change that delivered it.

## [Unreleased]

### Added

- **Orbis opens on the phone without Termux's permission** (change 0053-android-termux-run-command).
  - `orbis-phone open`, run in Termux, starts the hub if it is stopped and
    opens the Orbis app signed in. It needs no Android permission.
  - The app keeps the token of that link as its own, and opens the hub at
    once when it already answers.
  - When the permission never shows, the first screen says what the system
    reports (Termux's version and source, whether Termux declares the
    permission, whether the app asks for it) and points to `orbis-phone open`.

- **Orbis on the phone, with no computer** (change 0052-hub-on-the-phone).
  - The Android app starts the hub on the phone itself, inside Termux, and
    opens it signed in: no computer, no server, no pairing and no sign-in.
  - `scripts/android/orbis-termux.sh`, pasted once in Termux, installs:
    - a Debian with proot-distro;
    - Node.js 22;
    - Orbis, built from the repository;
    - Claude Code (native, or its last JavaScript release when the native one
      can't run).
  - It also lets the app start commands, and adds `orbis-phone`:
    `serve`, `stop`, `status`, `logs`, `update`, `token` and `setup-token`.
  - The app makes its own token and hands it over on each start (on stdin,
    never shown).
  - The app's first screen puts **Orbis on this phone** first, with the
    one-time setup when Termux or its permission is missing. Another Orbis (a
    computer or a server) moved into its own section.
  - The web app asks the app to start the hub again when Android stopped it.
  - The data, SQLite included, stays on the phone. Accounts and a database
    shared by the app and the web are planned for later.
  - ADR 0018, guide `docs/android.md`.

- **Orbis from anywhere, on your Claude plan** (change
  0051-claude-subscription-anywhere).
  - Claude Code can run on the token `claude setup-token` prints. That token
    is for your Pro or Max plan, lasts a year, and is never billed to the API.
  - The token is saved in **Settings → Brains → Claude Code → 🔑 Subscription
    token**, or set as `CLAUDE_CODE_OAUTH_TOKEN` on the hub.
  - It is kept encrypted and shown only as saved, with since when and until
    about when.
  - It is given to Claude Code alone, in runs, the brain test and the account
    check, and masked in run output. Claude Code never gets
    `ANTHROPIC_API_KEY` or `ANTHROPIC_AUTH_TOKEN`.
  - An API key pasted as the token is refused. A refused token says how to
    get a new one, and a bot secret of the same name gives that bot another
    account.
  - **Cloud kit**:
    - a `Dockerfile` for the hub, with Claude Code and Chromium; data and
      Claude Code's sign-in live in `/data`, and it runs as a normal user;
    - `deploy/docker-compose.yml`, with a free Cloudflare quick tunnel or
      your own tunnel;
    - a GitHub Codespaces `.devcontainer` that builds and starts the hub and
      asks for `ORBIS_TOKEN` and `CLAUDE_CODE_OAUTH_TOKEN` as Codespaces
      secrets.
  - Settings → Phone points to it. ADR 0017, guide `docs/cloud.md`.

- **Squads** (🛡 in the sidebar, change 0050-squads).
  - Bots organized in named squads, each with a handle such as `@growth`.
  - The members report to the squad's **representative** (★), and the
    representative to the squad's **manager**. One manager may take every
    squad. Delegation and report-back follow, and loops are refused.
  - Each squad has its own chat, and representatives and managers share the
    **squads room**. `@squad` in a group or in a handoff reaches the
    representative.
  - Bots know their squad and the others (`team.list_squads`).
  - The screen holds an org chart, a card per squad, the bots in no squad,
    one manager for all, and the squad in a bot's settings.
  - The sidebar filters by squad.
  - **Routines can be called by other bots** (`routine.call`): the answer
    comes back like a handoff's, and the routine shows who called it.
    `routine.list` with `bot: "all"` lists them.
  - ADR 0016, guide `docs/squads.md`.

- **Hiring** (💼 in the sidebar, change 0049-hiring).
  - A recruiter bot's brain writes short résumés of AI teammates, from 1 to 30
    at a time. Each résumé holds a name, a role, a headline, strengths and
    the tools they would use. The tools come only from what you have: the
    computer, browser, web and your connected MCP servers.
  - A round is based on a project's scope, or on one of your groups: its
    description, members and latest messages, plus an optional focus.
  - More asks for new résumés without repeats; you can also dismiss, bring
    back, or delete a round.
  - Only a hire writes the full profile: instructions, what it will do and
    needs, tools, and one to three skills of its own. It becomes a bot with a
    chosen brain and key. The bot joins the team under its lead and says
    hello with what it will do and what it needs.
  - The spend counts as runs of the recruiter, so it shows in usage and
    toward its cap.
  - New routes (`/api/v1/hiring/…`), new events (`hiring.updated`,
    `hiring.deleted`), ADR 0015, and the guide `docs/hiring.md`.
  - The brain test now asks through the same one-question path
    (`askBrain`).

- The MCP screen, redesigned after the MCP marketplaces of Claude, Cursor and
  VS Code (change 0048-mcp-screen-redesign). It has two tabs.
  - **Explore**:
    - a search box;
    - a filter by how a server connects;
    - categories, each with its count;
    - **Start here** picks at the top.
  - Each card shows the logo, where the server runs, what it does, how it
    connects, whether it only reads, and **Connect**.
  - A click opens the server's **details**: how it connects, the program or
    address, whether it asks before changing something, and who uses it. The
    key form is there too.
  - **Connected** shows each server's state, the faces of its bots, a switch
    per bot, and its tools split by what only reads and what asks first.
    Reconnect and Disconnect are in its ⋮ menu. With nothing connected, it
    says so and leads to Explore.
  - On a phone: one column, the categories in one scrolling row, and the
    details full screen, closed by Back. The catalog now says whether each
    server only reads (`readOnly`).

- Connecting the phone with a QR code (change 0047-pairing-qr-code).
  - **⚙ Settings → Phone** shows a QR code next to the six-digit code. It
    holds `<address>#pair=<code>`, never the token, and with several network
    cards you pick the address.
  - The Android app's first screen gets **Scan QR code**. It uses Google
    Play's scanner, so the app asks for no camera permission.
  - Without the app, the phone's camera opens the link in the browser,
    already signed in. The browser's sign-in screen also takes the six
    digits in place of the token.
  - A shared `#pair=` link connects too.
  - ADR 0014 supersedes ADR 0013.

- More free MCP servers, each with its own logo (change 0045-mcp-catalog-free-servers-and-logos).
  The sidebar's **🧩 Tools** is now **🧩 MCP**, and its catalog lists 37 servers.
  All of them are free: no account, a free plan or a free key. Each one was
  checked before it went in.
  - New with no account: Microsoft Learn, AWS Knowledge, Cloudflare Docs, GitMCP,
    CoinGecko, Jina AI Reader, Chrome DevTools, YouTube Transcript and Excel.
  - New with a sign-in: Todoist, monday.com, Vercel, Cloudflare Workers, Neon,
    Prisma Postgres, Postman, Semgrep and Stripe.
  - New with a free key: Alpha Vantage and Airtable. Alpha Vantage's key goes in
    the address the hub calls. The hub adds it from the vault on each call, and
    the API and errors never show it.
  - A new Finance category.
  - Each service's logo replaces the emoji on the catalog, on the connected
    servers and in a bot's tool switches. The sources are listed in
    `packages/web/public/logos/mcp/SOURCES.md`.

- The Android app's audit (change 0044-android-notifications-pairing-voice-and-sharing):
  **notifications** while the app is off screen (a bot's reply, an approval or a
  secret it asks for, a report; one per conversation; a tap opens it; muted
  groups only notify requests) with an optional **stay connected** service;
  **pairing with a code** — ⚙ Settings → Phone on the computer makes a six-digit
  code (once, five minutes) that the app trades for the token
  (`POST /api/v1/pairing`, `POST /api/v1/pairing/claim`); the phone's
  **dictation and voice**; **share to Orbis** from other apps (a sign-in link
  connects); the first screen offers recent hubs, **Paste** and tries again by
  itself.
- An Android app (change 0043-android-app-and-apk-workflow): `packages/android`, a
  small Java shell that shows the web app your hub serves on the phone (a first
  screen for the hub's address; a link with `#token=…` signs in), with the file
  picker, exports saved to Downloads, Back that closes what is open first, and
  links opening in the phone's browser. **Actions → Android APK → Run workflow**
  builds the APK of the current version (tests, lint, `orbis-android-<version>-build<N>.apk`),
  attaches it to the run and publishes it in a release for a direct download; a
  `v*` tag attaches it to that release; the `ANDROID_KEYSTORE_*` secrets sign it
  with your key so updates install in place. `Orbis-Celular.bat` (`Orbis.bat
  --celular`) starts the hub on the network and prints the address to type in
  the app. Guide: `docs/android.md`.
- Groups like WhatsApp or Telegram (change 0042-group-info-like-a-chat-app): the
  header shows the group's photo, name and members (or who is working); a **⋮**
  menu holds every option (add members, group info, links, search, mute, and
  under More: export, clear, delete); a click on the photo or the name opens the
  **group info** — a flyout on the right on a wide screen, full screen on a
  phone — with the photo (pick an image), name and **description** (read by the
  group's bots), add/search/mute/export buttons, the group's links, the members
  (message, make lead, remove) and the danger zone. **Add members** is always
  there: a dialog with the bots outside the group that says when every bot is
  already in it or the group is full (`ORBIS_MAX_GROUP_SIZE`). Search ignores
  case and accents and scrolls to the message. A muted group raises no "reported
  back" desktop notification and shows a gray unread dot.

### Fixed

- On a phone, no screen scrolls sideways any more (change 0046-phone-layout-no-sideways-scroll).
  The bot settings were 600 px wide on a 390 px phone. The cause: the brain
  select took the width of its longest option, and its fieldset never shrank
  below its content. The same check found two more screens that overflowed:
  - the new-bot form (509 px);
  - the brains and usage tables, which moved the whole screen sideways.
    Each table now scrolls on its own.
  A new end-to-end check (`tests/e2e/phone-layout.test.ts`) opens every screen,
  panel and dialog at 390 px. The Doctrina skill
  `phone-layout-no-sideways-scroll` records how to avoid this.

- The Android app: an `https` hub with a certificate the phone does not trust
  left a blank screen (now the first screen says why); the hub's page could
  point the app at another site through the bridge (now only the first screen
  can); `hidden` boxes on the first screen stayed visible.
- OpenAI-compatible company gateways (change 0041-openai-compatible-gateways): a
  key pasted in the bot's settings landed where the **name** of its secret goes,
  so the brain failed with "secret <the key> is not set" — repeating the key.
  The settings now have an **API key** field (kept encrypted in the bot's vault,
  never shown again); a key already pasted in the wrong place is moved into the
  vault when the hub starts and masked where it was quoted, and the check never
  echoes it. For Azure-style gateways: **How to send the key → api-key header**,
  `{model}` in the address for a model in the path, and an answer without a
  stream (`"stream": false`) is read, or asked for when the gateway refuses the
  stream. CLI: `--api-key-header bearer|api-key`.
- A deleted bot stayed in its groups on screen: it now leaves each of them (said
  in each), the web app follows, and a group left with no bot is deleted.
- `chat-http` messages blocked by a firewall that reads them (change 0038-chat-http-plain-chat): the
  connection test got through by every way, but each message carried ~6,000
  characters of Orbis's tool instructions (a shell, paths, placeholders) that the
  firewall reads as an attack. **Plain chat (no tools)** sends only the
  conversation, as the browser does; the firewall error says when to use it.
  Also: a curl program written `curl.EXE` (as Windows lists it) can be saved, and
  a refused save names the field.
- `chat-http` still blocked by Cloudflare through curl (change 0037-chat-http-proxy-and-connection-test):
  the firewall lets through what comes from the company's proxy, which the
  browser and Postman use and curl ignored. curl now goes through the proxy
  Windows uses for the chat's address (a PAC script included), signing in as the
  logged-in user; the bot can name its curl program and proxy; **Test
  connection** tries every way out (each curl, each proxy and none, Node) with no
  message and says which ones get through, with **Use this way**.
- The Windows launcher's icon (change 0036-launcher-creates-its-shortcuts): a `.bat`
  cannot carry an icon, so `Orbis.bat` now makes the Orbis shortcut (with the Orbis
  icon) on the Desktop and in the Start menu the first time it runs.
- `chat-http` behind Cloudflare (change 0035-chat-http-curl-transport): the chat
  answered the browser and `curl` but refused Node's own HTTP client with "Sorry,
  you have been blocked" (HTTP 403). Orbis now makes its requests with the system's
  `curl` (HTTP/2, the same TLS as the cURL that works; `fetch` when there is no
  curl), sends every browser header of the pasted cURL (`sec-ch-ua*`,
  `sec-fetch-*`, `User-Agent`…, never a cookie or a key), keeps the token off
  curl's command line, and names the firewall in the error. The company chat's
  stream (`message_complete`: reply, chat id, `tokenUsage`) is read directly,
  without the follow-up-questions block and without the history.
- Claude Code with an expired login (change 0033-claude-sign-in-and-chat-http-token-audit): the test showed
  "OAuth session expired" and offered no way out. A failed run or test now says
  how to sign in again, and the Claude Code card in ⚙ → Brains signs in from
  Orbis (`claude auth login`, with the page and the code box).
- `chat-http`, HTTP 403: the error now says what the server answered, what Orbis
  sent and what the browser sends that Orbis did not; a pasted cURL also copies
  `Referer`, `User-Agent` and `Accept-Language`, sent with every request.
- `chat-http` token: a pasted `Authorization: Bearer …` line, quotes or a
  wrapped paste are cleaned to the bare token; the bot's settings say whether a
  token is saved and when it expires.
- A bot's template export no longer carries a `chat-http` brain's `Origin` or
  history address.
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

- Groups like a chat app (change 0040-group-membership-and-clearing-a-conversation): "Ana joined the
  group" and "Ana left the group" in the conversation, with the bot's face; the
  group's header adds a bot (**+ Add…**), removes one (× on its chip), clears the
  conversation and deletes the group; a direct conversation can be cleared too
  (its messages, the bots' sessions of it and the run summaries it left; what a
  bot saved on purpose stays). A bot that joins reads the group's history; one
  that left is not brought back by a mention. A group can shrink to one bot.
- One Bearer token per chat API, changed in one place (change 0039-shared-chat-token-and-resizable-panel):
  every `chat-http` bot of the same API uses that API's token; ⚙ Settings →
  Brains → **Chat API tokens** lists each API, its token's expiry and its bots,
  and takes a new token or cURL for all of them at once (a bot's own settings do
  the same). A bot from before keeps its own token until its API has a shared one.
- The side panel's width can be dragged (or moved with the arrow keys) from its
  left edge and is remembered; a wide bot settings panel shows two columns.
- Windows launchers (change 0034-windows-launcher-scripts): `scripts/windows/Orbis.bat`
  starts Orbis — building first — and, when it is already running, restarts it
  (it stops only an Orbis hub, never another program on the port); `Orbis-Token.bat`
  shows or creates the login token, and `--novo` replaces it; `Orbis-Atalhos.bat`
  puts both on the Desktop and in the Start menu with the Orbis icon
  (`docs/brand/orbis.ico`, `npm run brand:ico`). See docs/windows.md.
- `chat-http` gives each chat a bot opens a title (change 0032-chat-http-titles),
  as the browser does: `POST …/history/chats/<chat id>/generate-title` with
  "Orbis · <bot> — <task>", once per new chat and in the background. One model
  call more per new chat; off in ⚙ → Brain → Advanced.
- `chat-http` takes each reply and its tokens from the chat's history (change
  0031-chat-http-history-first), the format the company chat returns
  (`data.chat.messages` with `role`, `content`, `usage`); the streamed text is
  only the fallback.
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
