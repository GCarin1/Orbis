# Contract — hub-surface

**Contract:** hub-surface
**Status:** active
**Last updated:** 2026-09-28

## Purpose

The seams between the Orbis hub and every client: the web app, the desktop
app, the `orbis` CLI, CLI brains reaching the tool gateway, OpenAI-compatible
clients and webhook senders. It owns the port map, the environment variables,
the budgets every capability shares, and the exact shapes of the REST routes,
the WebSocket events, the MCP endpoint and the OpenAI-compatible endpoint.

## Ports

| Service           | Port | Protocol         |
|-------------------|------|------------------|
| hub               | 7420 | http, websocket  |
| web-dev           | 5173 | http             |
| desktop-novnc     | 6080 | http, websocket  |
| desktop-cdp       | 9223 | http, websocket  |

- `hub` serves REST, the stream, MCP, the OpenAI-compatible endpoint, webhooks and the built web app.
- `web-dev` is the Vite dev server used only while developing the web app; it proxies `/api`, `/mcp`, `/v1` and `/hooks` to the hub.
- `desktop-novnc` listens inside each `orbis/desktop` container; the docker provider publishes it on a random 127.0.0.1 port and the hub proxies it at `/api/v1/bots/:id/computer/vnc/`.
- `desktop-cdp` relays the container's Chromium DevTools endpoint; the docker provider publishes it on a random 127.0.0.1 port and only the hub's browser tools connect to it.

## Environment

| Variable                 | Required | Values                          | Example                  |
|--------------------------|----------|---------------------------------|--------------------------|
| ORBIS_PORT               | no       | —                               | 7420                     |
| ORBIS_HOST               | no       | —                               | 127.0.0.1                |
| ORBIS_DATA_DIR           | no       | —                               | ~/.orbis                 |
| ORBIS_TOKEN              | no       | —                               | change-me-long-random    |
| ORBIS_MASTER_KEY         | no       | —                               | 64-hex-characters        |
| ORBIS_MAX_BOTS           | no       | —                               | 50                       |
| ORBIS_MAX_GROUP_SIZE     | no       | —                               | 6                        |
| ORBIS_MAX_HANDOFF_DEPTH  | no       | —                               | 6                        |
| ORBIS_MAX_CHAIN_RUNS     | no       | —                               | 12                       |
| ORBIS_ABSENCE_PAUSE_DAYS | no       | —                               | 14                       |
| ORBIS_COMPUTER_PROVIDER  | no       | `local\|host\|docker`           | local                    |
| ORBIS_LOG_LEVEL          | no       | `debug\|info\|warn\|error`      | info                     |
| ORBIS_BROWSER_EXECUTABLE | no       | —                               | /usr/bin/chromium        |
| ORBIS_DOCKER             | no       | —                               | docker                   |
| ORBIS_URL                | no       | —                               | http://127.0.0.1:7420    |
| ORBIS_RUN_TOKEN          | no       | —                               | set by the hub per run   |
| ANTHROPIC_API_KEY        | no       | —                               | sk-ant-...               |
| OPENAI_API_KEY           | no       | —                               | sk-...                   |
| ORBIS_OLLAMA_URL         | no       | —                               | http://127.0.0.1:11434/v1 |
| ORBIS_LMSTUDIO_URL       | no       | —                               | http://127.0.0.1:1234/v1 |
| ORBIS_TRANSCRIBE_URL     | no       | —                               | https://api.groq.com/openai/v1 |
| ORBIS_TRANSCRIBE_MODEL   | no       | —                               | whisper-1                |
| ORBIS_TRANSCRIBE_API_KEY | no       | —                               | gsk_...                  |

An empty value is treated as unset everywhere, so a blank line in `.env`
falls back to the default instead of becoming an empty string.

Files the hub keeps in the data directory: `token` (0600), `master.key`
(0600, generated when ORBIS_MASTER_KEY is unset — 64 hex characters) and,
optionally, `prices.json` (`{ "<model prefix>": { "input": USD, "output":
USD, "cacheRead"?, "cacheWrite"? } }` per million tokens, over the shipped
price table).

## Wiring

Every variable is read at runtime from the process environment of the
machine that runs Orbis; none is injected by CI.

| Variable                 | Origin | Workflow | Job/Step | Consumer                          |
|--------------------------|--------|----------|----------|-----------------------------------|
| ORBIS_PORT               | local  | —        | —        | packages/hub/src/config.ts        |
| ORBIS_HOST               | local  | —        | —        | packages/hub/src/config.ts        |
| ORBIS_DATA_DIR           | local  | —        | —        | packages/hub/src/config.ts        |
| ORBIS_TOKEN              | local  | —        | —        | packages/hub/src/config.ts        |
| ORBIS_MASTER_KEY         | local  | —        | —        | packages/hub/src/config.ts        |
| ORBIS_MAX_BOTS           | local  | —        | —        | packages/hub/src/config.ts        |
| ORBIS_MAX_GROUP_SIZE     | local  | —        | —        | packages/hub/src/config.ts        |
| ORBIS_MAX_HANDOFF_DEPTH  | local  | —        | —        | packages/hub/src/config.ts        |
| ORBIS_MAX_CHAIN_RUNS     | local  | —        | —        | packages/hub/src/config.ts        |
| ORBIS_ABSENCE_PAUSE_DAYS | local  | —        | —        | packages/hub/src/config.ts        |
| ORBIS_COMPUTER_PROVIDER  | local  | —        | —        | packages/hub/src/config.ts        |
| ORBIS_LOG_LEVEL          | local  | —        | —        | packages/hub/src/config.ts        |
| ORBIS_BROWSER_EXECUTABLE | local  | —        | —        | packages/hub/src/config.ts        |
| ORBIS_DOCKER             | local  | —        | —        | packages/hub/src/computer/docker.ts |
| ANTHROPIC_API_KEY        | local  | —        | —        | packages/hub/src/config.ts        |
| OPENAI_API_KEY           | local  | —        | —        | packages/hub/src/config.ts        |
| ORBIS_OLLAMA_URL         | local  | —        | —        | packages/hub/src/config.ts        |
| ORBIS_LMSTUDIO_URL       | local  | —        | —        | packages/hub/src/config.ts        |
| ORBIS_TRANSCRIBE_URL     | local  | —        | —        | packages/hub/src/config.ts        |
| ORBIS_TRANSCRIBE_MODEL   | local  | —        | —        | packages/hub/src/config.ts        |
| ORBIS_TRANSCRIBE_API_KEY | local  | —        | —        | packages/hub/src/config.ts        |
| ORBIS_URL                | local  | —        | —        | packages/cli/src/config.ts        |
| ORBIS_RUN_TOKEN          | local  | —        | —        | packages/hub/src/mcp/bridge.ts    |

## Budgets

| Limit                          | Direction | Value          |
|--------------------------------|-----------|----------------|
| context-conversation-items     | input     | 30 items       |
| context-conversation-chars     | input     | 12000 chars    |
| context-memory-entries         | input     | 8 entries      |
| message-text                   | input     | 32000 chars    |
| tool-result                    | output    | 20000 chars    |
| shell-output                   | output    | 65536 bytes    |
| shell-timeout                  | input     | 120 seconds    |
| run-timeout                    | input     | 900 seconds    |
| run-steps                      | input     | 25 steps       |
| run-summary                    | output    | 500 chars      |
| group-members                  | input     | 6 bots         |
| bots-per-installation          | input     | 50 bots        |
| routines-per-bot               | input     | 50 routines    |
| routine-runs-kept              | output    | 20 runs        |
| handoff-depth                  | input     | 6 hops         |

## Interfaces

### Authentication

- REST, OpenAI-compatible: header `Authorization: Bearer <token>`.
- Stream: query `?token=<token>` (browsers cannot set WebSocket headers).
- MCP: header `Authorization: Bearer <run-token>`; a run token is valid for one run and one bot and is revoked when the run ends.
- Webhooks: `X-Orbis-Signature: sha256=<hex>` or `X-Hub-Signature-256: sha256=<hex>`, HMAC-SHA256 of the raw body under the routine secret.
- Errors use one shape: `{ "error": { "code": "<slug>", "message": "<text>", "fields"?: { "<path>": "<why>" } } }` with status 400, 401, 404, 409, 422 or 500.

### Resource shapes

- `Bot`: `{ id, handle, name, role, description, avatar: { initials, color, shape: "orb"|"blob"|"square"|"pill"|"triangle"|"hexagon"|"cloud"|"drop" } (create and patch take `avatarColor` and `avatarShape`), brain: Brain, reportsTo: string|null (the manager's id; create and patch accept an id or handle, `null` clears), policy: Policy, computer: ComputerConfig, tools: string[] (allowlist globs, default ["*"]; `!glob` excludes; `*` covers Orbis's tools only, an external MCP tool `mcp.<server>.<tool>` needs a pattern that starts with `mcp.`; `["!*"]` allows nothing), skills: string[], spendCapUsd: number|null, capIncludesSubscription: boolean, pinned, hidden, state, lastMessage: { text, at }|null, createdAt, updatedAt }`.
- `Brain`: `{ kind: "mock"|"anthropic"|"openai"|"claude-code"|"codex"|"gemini-cli"|"cursor"|"ollama"|"lmstudio"|"custom-cli"|"chat-http", model?, baseUrl?, apiKeySecret?, command?, args?, maxSteps?, timeoutSec?, chat?: { agentId?, agentVersion?, temperature?, maxTokens?, origin?, historyUrl?, titles?, headers?: { "user-agent"?, "accept-language"?, referer?, "cache-control"?, pragma?, priority?, "sec-ch-ua"?, "sec-ch-ua-mobile"?, "sec-ch-ua-platform"?, "sec-fetch-dest"?, "sec-fetch-mode"?, "sec-fetch-site"? }, transport?: "curl"|"fetch", curl?, proxy?, plain? } }`. `chat-http`: `baseUrl` is the chat API's address, `apiKeySecret` (default `CHAT_BEARER_TOKEN`) names the bot secret holding its Bearer token; a template export leaves its `baseUrl` out; `chat.titles: false` stops the title call for the chats a bot opens; `chat.headers` are what the browser sent besides the token (no line breaks, no cookie); `chat.transport` picks the system `curl` (the default when installed) or Node's `fetch` for every request to the chat API; `chat.plain: true` sends only the conversation (no Orbis instructions, no tools); `chat.curl` names the curl program (its file is `curl` or `curl.exe`, in any case) and `chat.proxy` a proxy URL or `direct` (default: HTTPS_PROXY, else Windows' own proxy for the address); a template neither carries nor sets `chat.curl` and `chat.proxy`; a template export leaves out `baseUrl`, `chat.origin`, `chat.historyUrl` and `chat.headers`.
- `Policy`: `{ rules: [{ tool: "<name or glob>", decision: "allow"|"ask"|"deny", locked?: boolean }], grants: string[] }`.
- `ComputerConfig`: `{ enabled, provider?: "local"|"host"|"docker", hostDir? (`host` only: an absolute path to an existing folder, default the user's home; 400 naming `computer.hostDir` otherwise), image? (default "orbis/desktop:latest"), cpus? (default 1), memoryMb? (default 2048), hibernateAfterMin? (default 30) }`. `host` never appears in an exported template and is dropped from an imported one.
- `ComputerStatus`: `{ botId, enabled, provider: "local"|"host"|"docker", status: "stopped"|"running"|"hibernated", takeover: boolean, vncPath: string|null (docker and running only), lastUsedAt: string|null, screenshotAt: string|null }`.
- `SkillInfo`: `{ name ([a-z0-9-]{1,64}), description, when: string|null, scope: "account"|"bot", botId: string|null, updatedAt }`; `Skill` adds `content` (the SKILL.md document) and `body` (the Markdown after the frontmatter).
- `Routine`: `{ id, botId, name, trigger: { type: "cron", cron, timezone (IANA) } | { type: "webhook" }, instruction, approval: "normal"|"draft_only", enabled, paused, webhookPath: string|null, nextRunAt: string|null, lastRun: RoutineRun|null, createdAt, updatedAt }`; `RoutineRun`: `{ id, routineId, runId, test, status, summary, startedAt }`.
- Routine card data: `{ routineId, name, trigger, approval, event }`; states `created`, `enabled`, `disabled`, `paused`. Timeline event `skill.unavailable`: `event.data` = `{ botId, skill }`.
- Secret-request card data: `{ name, reason, botId, runId, answeredAt? }`; states `pending`, `fulfilled`, `declined`, `expired`. Tool inputs reference secrets as `{{secret:NAME}}`; values are resolved only for `computer.shell`, `computer.write_file`, `browser.open`, `browser.type` and `http.fetch`, and every value of the bot appears as `••••` in tool results, run steps, replies, bot timeline items and approval inputs.
- `UsageTotals`: `{ runs, inputTokens, outputTokens, cachedTokens, costUsd, subscriptionCostUsd }`; `UsageReport`: `{ from, to, total: UsageTotals, bots: [{ botId, usage: UsageTotals, spendCapUsd: number|null, capIncludesSubscription, cappedCostUsd }] }`.
- `BotTemplate` (YAML): `{ apiVersion: "orbis/v1", kind: "BotTemplate", metadata: { name, role, description, avatarColor, avatarShape? }, spec: { brain (no apiKeySecret), policy, computer, tools, skills, ownSkills: string[] (SKILL.md text), spendCapUsd, capIncludesSubscription, routines: [{ name, trigger, instruction, approval }] } }`.
- `Conversation`: `{ id, kind: "direct"|"group", title, members: string[] (bot ids), leadBotId: string|null, createdAt, lastItemAt }`.
- `TimelineItem`: `{ id, conversationId, kind: "message"|"event"|"card", author: { type: "user"|"bot"|"system", id: string|null }, text, parentId: string|null, mentions: string[], attachments: string[], reactions: { [emoji]: number }, runId: string|null, card?: Card, event?: { type, data }, createdAt, updatedAt }`.
- `Card`: `{ type: "approval"|"draft"|"handoff"|"secret-request"|"routine", state: string, data: object }`.
- `Run`: `{ id, botId, conversationId, trigger: { type: "message"|"handoff"|"mention"|"report"|"routine"|"webhook"|"api", ref } (`report`: the sender's single follow-up once every handoff of its run ended, `ref` = that run's id), depth, chainId (the user message, or the first run, that started the work; handoffs, reports and mentions carry it on), retryOf: string|null (the run this one tries again), status: "queued"|"running"|"waiting"|"done"|"failed"|"cancelled", steps: Step[], usage: { inputTokens, outputTokens, cachedTokens, costUsd, subscription }, error: string|null, createdAt, startedAt, finishedAt }`.
- `Step`: `{ type: "thinking"|"text"|"tool_call"|"tool_result", at, text?, tool?, callId?, input?, output?, isError? }`.
- `Approval`: `{ id, runId, botId, conversationId, itemId, tool, input (secrets masked), reason, status: "pending"|"approved"|"denied"|"expired", decision: "allow_once"|"allow_always"|"deny"|null, note, createdAt, decidedAt }`.
- Approval card data: `{ approvalId, botId, tool, input, reason, locked?, decision?, note? }`; states `pending`, `approved`, `denied`, `expired`.
- Draft card data: `{ channel: "email"|"chat"|"social"|"webhook", to, subject?, body, url?, botId, delivery?: { channel, at, ok, detail } }`; states `pending`, `sent`, `failed`, `discarded`.
- Handoff card data: `{ from, to (bot ids), task, context: string|null, returnResult: boolean (default true), receiverRunId: string|null, returnRunId?, reportRunId?, error? }`; states `queued`, `running`, `done`, `failed`. The receiver's reply has `parentId` = the card's item id. Every card of one sender run carries the same `reportRunId` once its `report` run is queued.
- `MemoryEntry`: `{ id, botId: string|null (null = team), kind: "preference"|"role"|"fact"|"summary", text, source ("user" or "run:<id>"), createdAt, updatedAt }`.
- Timeline event `handoff.depth_exceeded`: `event.data` = `{ from, to, depth, limit }`, posted when a handoff or a bot-to-bot mention would start a run deeper than the handoff-depth budget.
- Timeline event `chain.limit`: `event.data` = `{ from, to: string|null, limit }`, posted when a handoff or a mention would start a run beyond ORBIS_MAX_CHAIN_RUNS runs of one chain; the handoff tool call fails.
- Timeline event `mention.list`: `event.data` = `{ botId, named: string[] (bot ids) }`, posted when a bot's reply names more than two bots and so wakes none.
- Orbis tools added by change 0021: `skills.create` `{ name, description, when?, instructions, forBot?, replace? }` (write, asks by default) saves a bot-scope skill; `team.list_bots` returns `[{ handle (no @), name, role, busy, state }]`. A third call of the same tool with the same input in one run returns an error result without running.

### REST routes (prefix `/api/v1`)

- `GET /health` (no prefix, no auth) → `{ ok: true, version }`.
- `GET /bots?includeHidden=true` → `Bot[]` · `POST /bots` → 201 `Bot` · `GET|PATCH|DELETE /bots/:idOrHandle` · `POST /bots/:id/duplicate` → 201 `Bot`.
- `GET /bots/:id/conversation` → the direct `Conversation`, created on first request.
- `GET /bots/:id/export` → `text/yaml` (`Content-Disposition: attachment; filename="<handle>.orbis.yaml"`) — a `BotTemplate`; 422 `secrets_found` with `fields` `{ "line <n>": "<kind>" }` when the document looks like it holds a credential · `POST /bots/import` `{ yaml }` → 201 `Bot` (a fresh handle when the name is taken; routines start disabled); 400 naming `apiVersion`, `kind` or the first invalid field.
- `GET /bots/:id/memory` → `MemoryEntry[]` · `POST /bots/:id/memory` `{ kind, text }` → 201 · `GET /memory?scope=team` → team entries · `POST /memory` `{ kind, text }` → 201 team entry · `PATCH /memory/:id` `{ kind?, text? }` · `DELETE /memory/:id` → 204.
- `GET /bots/:id/secrets` → `[{ name, createdAt }]` (never values) · `PUT /bots/:id/secrets/:name` `{ value }` → `{ name, createdAt }` (400 for a name outside `[A-Z][A-Z0-9_]{0,63}`) · `DELETE /bots/:id/secrets/:name` → 204.
- `GET /bots/:id/computer` → `ComputerStatus` · `POST /bots/:id/computer/start|stop|takeover|release` → `ComputerStatus` (409 `computer_disabled`, 409 `computer_unavailable` when the provider fails, e.g. no Docker daemon) · `GET /bots/:id/computer/screenshot` → `image/png`, the latest screenshot kept after the bot's last browser action (404 before the first).
- `GET /computers` → `{ default, local: { available }, host: { available, home, platform, visibleBrowser }, docker: { available, installed, version, error, image, imagePresent, canBuild, build: { state: "idle"|"building"|"done"|"failed", startedAt, finishedAt, log, error } } }` · `POST /computers/docker/image` → 202 the build state, running `docker build --tag orbis/desktop:latest docker/desktop/` in the background (409 `docker_unavailable`, 409 `no_dockerfile`).
- `POST /bots/:id/computer/vnc-session` → `{ url }` and a `Set-Cookie: orbis_vnc=…; Path=/api/v1/bots/:id/computer/vnc/; HttpOnly; SameSite=Strict` (409 `no_desktop` for the local provider, 409 `computer_stopped`) · `GET /bots/:id/computer/vnc/*` (noVNC files) and the WebSocket `GET /bots/:id/computer/vnc/websockify` accept that cookie instead of the bearer token.
- `GET /conversations` · `POST /conversations` `{ title, members (ids or handles), leadBotId? }` → 201 group; 400 below 2 members, 409 `group_full` above the group-members budget · `GET /conversations/:id` · `PATCH /conversations/:id` `{ title?, leadBotId? }` · `DELETE /conversations/:id` → 204 (groups only) · `POST /conversations/:id/members` `{ botId }` (409 `group_full`, `already_member`) · `DELETE /conversations/:id/members/:botId` (409 `group_too_small`; removing the lead passes the lead to the next member).
- `GET /conversations/:id/items?before=<id>&limit=<n>` → `TimelineItem[]` · `POST /conversations/:id/messages` `{ text, parentId?, attachments? }` → 201 `{ item, runs: Run[] }` · `POST /conversations/:id/read`.
- `POST /items/:id/reactions` `{ emoji }` · `DELETE /items/:id/reactions/:emoji`.
- `GET /runs?botId=&conversationId=&status=` · `GET /runs/:id` · `POST /runs/:id/cancel` · `POST /runs/:id/retry` → 201 the new `Run` (same bot, conversation, task and skill; `retryOf` = the old id; a handoff card points at it), 409 `run_not_ended` unless the run failed or was cancelled.
- `GET /approvals?status=pending` · `GET /approvals/:id` · `POST /approvals/:id` `{ decision: "allow_once"|"allow_always"|"deny", note? }` → the `Approval`; 409 when it is no longer pending.
- `POST /cards/:itemId/send` `{ fields?: { to?, subject?, body?, url? } }` → the updated item · `POST /cards/:itemId/discard` → the updated item (drafts; 409 once sent or discarded) · `POST /cards/:itemId/secret` `{ value }` or `{ decline: true }` (secret requests; the answered card never holds the value; 409 `card_closed` once answered).
- `GET /skills?botId=&offered=` → `SkillInfo[]`: account skills without `botId`, that bot's own skills with it, and with `offered=true` the skills the bot is offered (its allowlist of account skills plus its own) · `POST /skills` `{ content, botId? }` → 201 `Skill` (400 with `fields.name` / `fields.description`, 409 `skill_exists`) · `GET /skills/:name?botId=` → `Skill` · `PUT /skills/:name?botId=` `{ content }` (the name cannot change) · `DELETE /skills/:name?botId=` → 204.
- `GET /bots/:id/routines` → `Routine[]` · `POST /bots/:id/routines` `{ name, trigger, instruction, approval? }` → 201 `Routine` with `secret` (409 `routine_limit` past the routines-per-bot budget) · `GET /routines/:id` → `Routine` with `secret` · `PATCH /routines/:id` `{ name?, trigger?, instruction?, approval? }` · `DELETE /routines/:id` → 204 · `POST /routines/:id/test` → 202 `RoutineRun` (a draft-only run) · `POST /routines/:id/enable` `{ force? }` → `Routine` (409 `untested` without a successful test run unless `force`; clears `paused`) · `POST /routines/:id/disable` → `Routine` · `GET /routines/:id/runs` → the last 20 `RoutineRun`, newest first.
- `GET /usage?from=&to=&botId=` → `UsageReport` for `[from, to)` (default: the current UTC calendar month); 400 when `to` is not after `from`.
- `GET /runtimes/health` → `[{ kind, executable, found, path, version }]` for `claude-code`, `codex`, `gemini-cli` and `cursor`.
- `GET /runtimes/local` → `[{ kind, baseUrl, reachable, models, error }]` for `ollama` and `lmstudio`.
- `POST /bots/:id/chat-check` → `ChatConnectionCheck` `{ url, proxies: { windows, env }, results: [{ transport, curl, proxy, verdict: "ok"|"token"|"reached"|"blocked"|"error", status, detail, ms }] }`: one GET of the chats' list (no message) by each way out — each curl, each proxy and none, Node; 400 for a bot that is not chat-http or has no token; 409 `test_running` while one runs.
- `GET /bots/:id/chat-token` → `{ saved, expiresAt, expired, source: "shared"|"bot"|null }`: whether the bot has a `chat-http` token — its chat API's shared one, else its own — and when its `exp` says it stops working (never the token).
- `GET /chat-http/tokens` → `ChatTokenGroup[]` `[{ origin, token: { saved, expiresAt, expired, source }, bots: [{ id, name, handle }] }]`, one per chat API (the origin of chat-http bots' addresses) · `PUT /chat-http/tokens` `{ origin, value }` (an address or origin, and the token, bare or as `Bearer …`) → the list: that API's token, shared by its bots, kept encrypted in the hub's vault (400 for an address that is not http(s) or a value with no token).
- `GET /runtimes/claude/account` → `{ installed, version, path, loggedIn, method, detail, job: CliJob|null }` (`claude --version`, `claude auth status`) · `POST /runtimes/claude/login` → 202 `CliJob` (`claude auth login --claudeai`; `url` is the page it prints) · `POST /runtimes/claude/code` `{ code }` → `{ sent: true }` (the code that page shows, typed to the waiting login; 409 `no_sign_in` when none waits) · `POST /runtimes/claude/cancel` → the job.
- `GET /runtimes/codex/account` → `{ installed, version, path, loggedIn, method: "chatgpt"|"api-key"|null, detail, job: CliJob|null }` · `POST /runtimes/codex/install` → 202 `CliJob` (`npm install -g @openai/codex@latest`) · `POST /runtimes/codex/login` `{ device? }` → 202 `CliJob` (`codex login`, or `codex login --device-auth`) · `POST /runtimes/codex/cancel` → the job · `POST /runtimes/codex/logout` → the account. `CliJob`: `{ kind: "install"|"login", state: "running"|"done"|"failed", startedAt, finishedAt, url, code, log, error }`; one job at a time.
- `POST /runtimes/test` `{ botId }` (the bot's brain, with its secrets) or `{ brain }` → `{ kind, ok, reply, error, durationMs, answered }`; `409 test_running` while the same bot or brain kind is being tested.
- `GET /voice` → `{ transcription: { configured, source: "settings"|"env"|"openai"|null, url, model, hasKey } }` (never the key) · `PUT /voice/transcription` `{ url?, model?, apiKey? }` (a value replaces, `null` or `""` clears, absent keeps; 400 for a non-http URL) → the same · `POST /voice/test` → `{ ok, text, durationMs, error }` (a second of silence sent to the service) · `POST /voice/transcribe?lang=<pt-BR|en-US>` with an `audio/*` or `application/octet-stream` body up to 25 MiB → `{ text }`; 503 `transcription_unavailable` when no service is set up, 502 `transcription_failed` when it fails. The hub forwards the audio as `multipart/form-data` (`file` named `speech.<ext>` after the content type, `model`, `language` as two letters, `response_format=json`) to `<url>/audio/transcriptions` with `Authorization: Bearer <key>` when a key is set. The service is the one saved from the settings screen (the key encrypted with the vault's key in the `settings` table), else `ORBIS_TRANSCRIBE_URL`, else `https://api.openai.com/v1` with `OPENAI_API_KEY`; the model defaults to `whisper-1`.
- `GET /mcp/catalog` → the marketplace: `[{ id, name, icon, category, description: { en, "pt-BR" }, transport: "stdio"|"http", command?, args?, url?, auth: "none"|"token"|"oauth", fields: [{ key, label, secret, target: "env"|"arg"|"bearer", placeholder?, help?, link?, optional? }], homepage, needs?, connected: serverId|null }]` · `GET /mcp/servers` → `McpServer[]` · `POST /mcp/servers` `{ catalogId, values? }` or a custom `{ name, transport, command?, args?, url?, env?, token? }` → 202 `McpServer` with `status: "connecting"` (400 naming `values.<key>` for an empty required field, `catalogId` for an unknown or already connected entry) · `GET /mcp/servers/:id` · `POST /mcp/servers/:id/reconnect` → 202 · `POST /mcp/servers/:id/bots` `{ botId, enabled }` → `McpServer` (adds or removes `mcp.<id>.*` in the bot's allowlist) · `DELETE /mcp/servers/:id` → 204 (its secrets deleted, its patterns removed from every allowlist). `McpServer`: `{ id, name, icon, catalogId, transport, url, command, args, auth, status: "connecting"|"connected"|"needs_auth"|"error", error, authUrl (while needs_auth), tools: [{ name: "mcp.<id>.<tool>", remoteName, description, readOnly }], bots: botId[], createdAt, updatedAt }`. Keys, tokens and OAuth sign-ins are hub secrets, never returned.
- `GET /tools` → `[{ name, description, risk, server: string|null }]`, every tool a bot can be given.
- `GET /oauth/mcp/callback?state=&code=` (no prefix, no API token: the one-time state is the proof) → an HTML page; trades the code (PKCE) for tokens and connects the server. The hub registers itself with each authorization server as a public client named "Orbis" with this redirect URI.
- `GET /openapi.json` → OpenAPI 3.1 document.

### Stream (`/api/v1/stream`)

- Client → hub: `{ "type": "subscribe", "conversations"?: string[] }`, `{ "type": "ping" }`.
- Hub → client: `{ "type": "subscribed", "data": { conversations }, ... }` acknowledges each subscribe; events after it are never missed.
- Hub → client: `{ "type": "<event>", "data": {...}, "ts": "<ISO-8601>" }` where `<event>` is one of `bot.state` `{ botId, state }`, `bot.updated` `{ bot }`, `bot.deleted` `{ botId }`, `bot.report` `{ botId, conversationId, itemId, text }` (a bot's `report` run replied: it came back to the user on its own), `conversation.updated` `{ conversation }`, `conversation.deleted` `{ conversationId }`, `timeline.item` `{ conversationId, item }`, `run.updated` `{ run }` (steps omitted), `run.step` `{ runId, conversationId, botId, step }`, `approval.requested` `{ approval }`, `approval.resolved` `{ approval }`, `computer.updated` `{ botId, computer: ComputerStatus }`, `mcp.updated` `{ server: McpServer }`, `mcp.deleted` `{ serverId }`, `pong`. Account-wide (sent to every subscriber): `bot.*`, `approval.*`, `computer.updated`, `mcp.*`, `pong`.

### MCP (`/mcp`)

- `POST /mcp`, body one JSON-RPC 2.0 request (no batches), response `application/json`, `202` with no body for a notification; `GET /mcp` answers 405 (no server-sent stream); a missing, unknown or revoked run token answers 401. Methods: `initialize` (answers `protocolVersion: "2025-06-18"`, `capabilities: { tools: {} }`, `serverInfo: { name: "orbis", version }`), `notifications/initialized` (202, no body), `ping`, `tools/list`, `tools/call`.
- Tool names on the wire replace dots with underscores (`team.handoff` → `team_handoff`) because MCP clients prefix names with the server name.
- `approval_prompt` is an extra tool offered only to `claude-code` runs: input `{ tool_name, input, tool_use_id? }`, output text holding `{ "behavior": "allow", "updatedInput": {...} }` or `{ "behavior": "deny", "message": "..." }`.

### OpenAI-compatible

- `GET /v1/models` → `{ object: "list", data: [{ id: "orbis:<handle>", object: "model", owned_by: "orbis" }] }`.
- `POST /v1/chat/completions` `{ model: "orbis:<handle>", messages, stream? }` → `{ id, object: "chat.completion", created, model, choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }], usage: { prompt_tokens, completion_tokens, total_tokens } }`; with `stream: true`, `text/event-stream` of `chat.completion.chunk` objects ending with `data: [DONE]`.

### Webhooks

- `POST /hooks/routines/:id` with any content type (body at most 1 MiB, signed as raw bytes) → 202 `{ runId }`; 401 on a missing or bad signature; 404 for an unknown, disabled or non-webhook routine. The payload reaches the bot inside `<untrusted-content source="webhook:<routine name>">`, with `X-GitHub-Event` named when present.

## References

- `specs/hub-api`
- `specs/bots`
- `specs/conversations`
- `specs/handoff`
- `specs/memory`
- `specs/tool-gateway`
- `specs/approvals`
- `specs/routines`
- `specs/secrets`
- `specs/usage`
- `specs/computer`
- `specs/cli`
- `specs/web-app`
- `specs/desktop-app`
