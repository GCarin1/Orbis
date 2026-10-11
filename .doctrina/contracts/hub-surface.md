# Contract — hub-surface

**Contract:** hub-surface
**Status:** active
**Last updated:** 2026-10-03

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
| CLAUDE_CODE_OAUTH_TOKEN  | no       | —                               | from `claude setup-token` |
| OPENAI_API_KEY           | no       | —                               | sk-...                   |
| ORBIS_OLLAMA_URL         | no       | —                               | http://127.0.0.1:11434/v1 |
| ORBIS_LMSTUDIO_URL       | no       | —                               | http://127.0.0.1:1234/v1 |
| ORBIS_TRANSCRIBE_URL     | no       | —                               | https://api.groq.com/openai/v1 |
| ORBIS_TRANSCRIBE_MODEL   | no       | —                               | whisper-1                |
| ORBIS_TRANSCRIBE_API_KEY | no       | —                               | gsk_...                  |
| ORBIS_SUPABASE_URL       | no       | `https://…` or `off`            | https://tqjxkgxmnkypzbpirztw.supabase.co |
| ORBIS_SUPABASE_KEY       | no       | —                               | sb_publishable_...       |
| ORBIS_CLOUD_URL          | no       | `https://…` or `off`            | https://orbis.example.workers.dev |

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
| CLAUDE_CODE_OAUTH_TOKEN  | local  | —        | —        | packages/hub/src/config.ts        |
| OPENAI_API_KEY           | local  | —        | —        | packages/hub/src/config.ts        |
| ORBIS_OLLAMA_URL         | local  | —        | —        | packages/hub/src/config.ts        |
| ORBIS_LMSTUDIO_URL       | local  | —        | —        | packages/hub/src/config.ts        |
| ORBIS_TRANSCRIBE_URL     | local  | —        | —        | packages/hub/src/config.ts        |
| ORBIS_TRANSCRIBE_MODEL   | local  | —        | —        | packages/hub/src/config.ts        |
| ORBIS_TRANSCRIBE_API_KEY | local  | —        | —        | packages/hub/src/config.ts        |
| ORBIS_SUPABASE_URL       | local  | —        | —        | packages/hub/src/config.ts        |
| ORBIS_SUPABASE_KEY       | local  | —        | —        | packages/hub/src/config.ts        |
| ORBIS_CLOUD_URL          | local  | —        | —        | packages/hub/src/config.ts        |
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

- REST, OpenAI-compatible: header `Authorization: Bearer <token>`, the hub's token or, once an account is linked (change 0064), a Supabase Auth session of that account: an ES256/RS256 JWT checked against `<ORBIS_SUPABASE_URL>/auth/v1/.well-known/jwks.json` (kept 10 minutes, fetched again for an unknown key id at most every 30 s), with `iss` `<url>/auth/v1`, `aud` `authenticated`, `role` `authenticated`, not anonymous, `exp`/`nbf` within 30 s, and `sub` the linked account's id. Defaults: the Orbis project and its publishable key; `ORBIS_SUPABASE_URL=off` takes no account.
- Stream: query `?ticket=<ticket>` from `POST /api/v1/stream/ticket` (browsers cannot set WebSocket headers); a ticket works once, within 60 s. The token never travels in an address.
- File content: query `?key=<key>` from `POST /api/v1/files/key` (an HMAC key of the hub's run, an hour, for `GET /files/:id/content` only), or the bearer header.
- A refused credential answers 401; past 20 refusals a minute from one address, 429 `too_many_failures` instead. A valid credential is never refused for that.
- Pairing: `POST /api/v1/pairing/claim` and `GET /api/v1/auth/config` take no token (a phone trades a pairing code for it; the sign-in screen asks where accounts sign in); every other `/api` route needs it.
- MCP: header `Authorization: Bearer <run-token>`; a run token is valid for one run and one bot and is revoked when the run ends.
- Webhooks: `X-Orbis-Signature: sha256=<hex>` or `X-Hub-Signature-256: sha256=<hex>`, HMAC-SHA256 of the raw body under the routine secret.
- Errors use one shape: `{ "error": { "code": "<slug>", "message": "<text>", "fields"?: { "<path>": "<why>" } } }` with status 400, 401, 404, 409, 422 or 500.

### Resource shapes

- `Bot`: `{ id, handle, name, role, description, avatar: { initials, color, shape: "orb"|"blob"|"square"|"pill"|"triangle"|"hexagon"|"cloud"|"drop" } (create and patch take `avatarColor` and `avatarShape`), brain: Brain, reportsTo: string|null (the manager's id; create and patch accept an id or handle, `null` clears; a squad sets it for its bots), squadId: string|null (the bot's squad), policy: Policy, computer: ComputerConfig, tools: string[] (allowlist globs, default ["*"]; `!glob` excludes; `*` covers Orbis's tools only, an external MCP tool `mcp.<server>.<tool>` needs a pattern that starts with `mcp.`; `["!*"]` allows nothing), skills: string[], spendCapUsd: number|null, capIncludesSubscription: boolean, pinned, hidden, initiative: { enabled (default false), frequency: "rare"|"normal"|"often", mcpUpdates (default true) } (create and patch take any of its fields; templates do not carry it), state, lastMessage: { text, at }|null, createdAt, updatedAt }`.
- Health (change 0062, ADR 0019): `PUT /health/sync` `{ days: [{ date: "YYYY-MM-DD", metrics: { steps?, distance_m?, active_kcal?, total_kcal?, heart_rate_avg?, heart_rate_min?, heart_rate_max?, resting_heart_rate?, sleep_minutes?, sleep_deep_minutes?, sleep_rem_minutes?, sleep_light_minutes?, sleep_awake_minutes?, exercise_minutes?, weight_kg?, body_fat_pct?, oxygen_saturation_avg? } }] (≤ 120), sessions?: [{ id, start, end, type, title, source }] (≤ 1,000), sources?: string[] }` → `HealthStatus` (each day's values replace that day's; 400 naming `days.<i>.date` or `days.<i>.metrics.<key>`) · `GET /health/status` → `{ lastSyncAt, days, firstDate, lastDate, sources, bots }` · `GET /health/summary?days=<1–120, default 7>` → `{ days: HealthDay[] (newest first), sessions }` · `POST /health/bots` `{ botId, enabled }` → the `Bot` (adds `health.*`, or removes every `health.` pattern) · `DELETE /health` → 204. Tools `health.summary` `{ days? (1–90, default 7), metrics? }` and `health.sessions` `{ days? (default 14) }` (read) are given only by a pattern starting with `health.`; `GET /tools` marks them `explicit: "health."`.
- Initiative (change 0060): `GET /initiative` → `{ enabled (default true), quietStart, quietEnd ("HH:MM", default 22:00 and 08:00; equal: none), timezone (IANA, default UTC) }` · `PUT /initiative` with any of them (400 naming `quietStart`, `quietEnd` or `timezone`) · `POST /bots/:id/initiative/now` → 202 the `Run` (409 `bot_busy` while the bot works). A run of initiative has `trigger: { type: "initiative", ref: "idle"|"mcp"|"test" }`, runs in the bot's direct conversation, posts nothing when the bot answers `[silent]` and posts no `run.failed` event when it fails.
- `Brain`: `{ kind: "mock"|"anthropic"|"openai"|"claude-code"|"codex"|"gemini-cli"|"cursor"|"ollama"|"lmstudio"|"custom-cli"|"chat-http", model?, baseUrl?, apiKeySecret?, apiKeyHeader?: "bearer"|"api-key", command?, args?, maxSteps?, timeoutSec?, chat?: { agentId?, agentVersion?, temperature?, maxTokens?, origin?, historyUrl?, titles?, headers?: { "user-agent"?, "accept-language"?, referer?, "cache-control"?, pragma?, priority?, "sec-ch-ua"?, "sec-ch-ua-mobile"?, "sec-ch-ua-platform"?, "sec-fetch-dest"?, "sec-fetch-mode"?, "sec-fetch-site"? }, transport?: "curl"|"fetch", curl?, proxy?, plain? } }`. `apiKeySecret` is a secret's name (`^[A-Z][A-Z0-9_]{0,63}$`; a bot is refused with any other value); `openai`: a `{model}` in `baseUrl` is replaced by the model, `apiKeyHeader: "api-key"` sends the key in an `api-key` header instead of `Authorization: Bearer`, and a JSON (non-streamed) answer is read. `chat-http`: `baseUrl` is the chat API's address, `apiKeySecret` (default `CHAT_BEARER_TOKEN`) names the bot secret holding its Bearer token; a template export leaves its `baseUrl` out; `chat.titles: false` stops the title call for the chats a bot opens; `chat.headers` are what the browser sent besides the token (no line breaks, no cookie); `chat.transport` picks the system `curl` (the default when installed) or Node's `fetch` for every request to the chat API; `chat.plain: true` sends only the conversation (no Orbis instructions, no tools); `chat.curl` names the curl program (its file is `curl` or `curl.exe`, in any case) and `chat.proxy` a proxy URL or `direct` (default: HTTPS_PROXY, else Windows' own proxy for the address); a template neither carries nor sets `chat.curl` and `chat.proxy`; a template export leaves out `baseUrl`, `chat.origin`, `chat.historyUrl` and `chat.headers`.
- `Policy`: `{ rules: [{ tool: "<name or glob>", decision: "allow"|"ask"|"deny", locked?: boolean }], grants: string[] }`.
- `ComputerConfig`: `{ enabled, provider?: "local"|"host"|"docker", hostDir? (`host` only: an absolute path to an existing folder, default the user's home; 400 naming `computer.hostDir` otherwise), image? (default "orbis/desktop:latest"), cpus? (default 1), memoryMb? (default 2048), hibernateAfterMin? (default 30) }`. `host` never appears in an exported template and is dropped from an imported one.
- `ComputerStatus`: `{ botId, enabled, provider: "local"|"host"|"docker", status: "stopped"|"running"|"hibernated", takeover: boolean, vncPath: string|null (docker and running only), lastUsedAt: string|null, screenshotAt: string|null }`.
- `SkillInfo`: `{ name ([a-z0-9-]{1,64}), description, when: string|null, scope: "account"|"bot", botId: string|null, updatedAt }`; `Skill` adds `content` (the SKILL.md document) and `body` (the Markdown after the frontmatter).
- `Routine`: `{ id, botId, name, trigger: { type: "cron", cron, timezone (IANA) } | { type: "webhook" }, instruction, approval: "normal"|"draft_only", enabled, paused, webhookPath: string|null, nextRunAt: string|null, lastRun: RoutineRun|null, createdAt, updatedAt }`; `RoutineRun`: `{ id, routineId, runId, test, status, summary, startedAt, calledBy: string|null (the bot that called it with routine.call) }`.
- `Squad`: `{ id, name, handle (unique; never a bot's handle or role), description, color, representativeId: string|null (a member), managerId: string|null (a bot outside the squad), conversationId: string|null (the squad's group, from two members), members: string[] (bot ids, by name), createdAt, updatedAt }`; `SquadsView`: `{ squads: Squad[], roomId: string|null (the group of every representative and manager) }`.
- Routine card data: `{ routineId, name, trigger, approval, event }`; states `created`, `enabled`, `disabled`, `paused`. Timeline event `skill.unavailable`: `event.data` = `{ botId, skill }`.
- Secret-request card data: `{ name, reason, botId, runId, answeredAt? }`; states `pending`, `fulfilled`, `declined`, `expired`. Tool inputs reference secrets as `{{secret:NAME}}`; values are resolved only for `computer.shell`, `computer.write_file`, `browser.open`, `browser.type` and `http.fetch`, and every value of the bot appears as `••••` in tool results, run steps, replies, bot timeline items and approval inputs.
- `UsageTotals`: `{ runs, inputTokens, outputTokens, cachedTokens, costUsd, subscriptionCostUsd }`; `UsageReport`: `{ from, to, total: UsageTotals, bots: [{ botId, usage: UsageTotals, spendCapUsd: number|null, capIncludesSubscription, cappedCostUsd }] }`.
- `HiringRound`: `{ id, basis: "project"|"team", brief, groupId: string|null, recruiterId: string|null, requested, status: "generating"|"ready"|"failed", error: string|null, usage: { inputTokens, outputTokens, costUsd }, candidates: Candidate[], createdAt, updatedAt }`; `Candidate`: `{ id, roundId, name, role, headline, strengths: string[], tools: string[] (`computer`|`browser`|`web`|`mcp.<server>`), status: "open"|"hiring"|"hired"|"dismissed", error: string|null, botId: string|null, createdAt }`; `HiringTool`: `{ id, name, description, logo: string|null }`.
- `BotTemplate` (YAML): `{ apiVersion: "orbis/v1", kind: "BotTemplate", metadata: { name, role, description, avatarColor, avatarShape? }, spec: { brain (no apiKeySecret), policy, computer, tools, skills, ownSkills: string[] (SKILL.md text), spendCapUsd, capIncludesSubscription, routines: [{ name, trigger, instruction, approval }] } }`.
- `Conversation`: `{ id, kind: "direct"|"group", title, members: string[] (bot ids), leadBotId: string|null, description: string, photo: string|null (a `data:image/(png|jpeg|webp|gif);base64,…` URL), muted: boolean, createdAt, lastItemAt }`.
- `ConversationLink`: `{ url, itemId, author: Author, createdAt }`.
- `TimelineItem`: `{ id, conversationId, kind: "message"|"event"|"card", author: { type: "user"|"bot"|"system", id: string|null }, text, parentId: string|null, mentions: string[], attachments: string[], reactions: { [emoji]: number }, runId: string|null, card?: Card, event?: { type, data }, createdAt, updatedAt }`.
- `Card`: `{ type: "approval"|"draft"|"handoff"|"secret-request"|"routine", state: string, data: object }`.
- `Run`: `{ id, botId, conversationId, trigger: { type: "message"|"handoff"|"mention"|"report"|"routine"|"webhook"|"api"|"hiring", ref } (`report`: the sender's single follow-up once every handoff of its run ended, `ref` = that run's id; `hiring`: a recruiter's answer for a hiring round, `ref` = the round's id, no conversation), depth, chainId (the user message, or the first run, that started the work; handoffs, reports and mentions carry it on), retryOf: string|null (the run this one tries again), status: "queued"|"running"|"waiting"|"done"|"failed"|"cancelled", steps: Step[], usage: { inputTokens, outputTokens, cachedTokens, costUsd, subscription }, error: string|null, createdAt, startedAt, finishedAt }`.
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
- Orbis tools added by change 0059 (files in conversations): `files.list` `{}` (read) → the run's conversation's files `[{ id, name, type, size, from, sentAt }]`; `files.get` `{ file: id or name }` (read) → copies it into the bot's workspace under `orbis-files/` and returns the path (and the text of a text file up to 20,000 bytes, as untrusted content); `files.send` `{ path, caption? }` (write, allowed by default) → posts a file of the bot's workspace (≤ 25 MB) in the run's conversation as a message of the bot. A user's message carrying files copies them into the workspace of each bot it wakes and appends their names, kinds, sizes and paths to that bot's task.

### REST routes (prefix `/api/v1`)

- `GET /health` (no prefix, no auth) → `{ ok: true, version }`.
- `POST /pairing` → `PairingCode` `{ code (6 digits), expiresAt, listening (the hub takes network connections), addresses (http://<IPv4>:<port>/ of each network card) }`, a new code replacing the last; `DELETE /pairing` → 204, cancels it · `POST /pairing/claim` `{ code }` (no auth; spaces and dashes ignored) → `{ token }`; 401 `invalid_code` (wrong, used, expired, or the code's fifth wrong try kills it); 429 `too_many_tries` past 20 claims a minute. A code lives 5 minutes and works once.
- `GET /bots?includeHidden=true` → `Bot[]` · `POST /bots` → 201 `Bot` · `GET|PATCH|DELETE /bots/:idOrHandle` · `POST /bots/:id/duplicate` → 201 `Bot`.
- `GET /bots/:id/conversation` → the direct `Conversation`, created on first request.
- `GET /bots/:id/export` → `text/yaml` (`Content-Disposition: attachment; filename="<handle>.orbis.yaml"`) — a `BotTemplate`; 422 `secrets_found` with `fields` `{ "line <n>": "<kind>" }` when the document looks like it holds a credential · `POST /bots/import` `{ yaml }` → 201 `Bot` (a fresh handle when the name is taken; routines start disabled); 400 naming `apiVersion`, `kind` or the first invalid field.
- `GET /bots/:id/memory` → `MemoryEntry[]` · `POST /bots/:id/memory` `{ kind, text }` → 201 · `GET /memory?scope=team` → team entries · `POST /memory` `{ kind, text }` → 201 team entry · `PATCH /memory/:id` `{ kind?, text? }` · `DELETE /memory/:id` → 204.
- `GET /bots/:id/secrets` → `[{ name, createdAt }]` (never values) · `PUT /bots/:id/secrets/:name` `{ value }` → `{ name, createdAt }` (400 for a name outside `[A-Z][A-Z0-9_]{0,63}`) · `DELETE /bots/:id/secrets/:name` → 204.
- `GET /bots/:id/computer` → `ComputerStatus` · `POST /bots/:id/computer/start|stop|takeover|release` → `ComputerStatus` (409 `computer_disabled`, 409 `computer_unavailable` when the provider fails, e.g. no Docker daemon) · `GET /bots/:id/computer/screenshot` → `image/png`, the latest screenshot kept after the bot's last browser action (404 before the first).
- `GET /computers` → `{ default, local: { available }, host: { available, home, platform, visibleBrowser }, docker: { available, installed, version, error, image, imagePresent, canBuild, build: { state: "idle"|"building"|"done"|"failed", startedAt, finishedAt, log, error } } }` · `POST /computers/docker/image` → 202 the build state, running `docker build --tag orbis/desktop:latest docker/desktop/` in the background (409 `docker_unavailable`, 409 `no_dockerfile`).
- `POST /bots/:id/computer/vnc-session` → `{ url }` and a `Set-Cookie: orbis_vnc=…; Path=/api/v1/bots/:id/computer/vnc/; HttpOnly; SameSite=Strict` (409 `no_desktop` for the local provider, 409 `computer_stopped`) · `GET /bots/:id/computer/vnc/*` (noVNC files) and the WebSocket `GET /bots/:id/computer/vnc/websockify` accept that cookie instead of the bearer token.
- `GET /conversations` · `POST /conversations` `{ title, members (ids or handles), leadBotId?, description? }` → 201 group; 400 below 2 members, 409 `group_full` above the group-members budget · `GET /conversations/:id` · `PATCH /conversations/:id` `{ title?, leadBotId?, description? (≤ 2000), photo? (data: image URL ≤ 400,000 chars, or null), muted? }` (groups only; a changed name, description, photo or lead posts a `group.renamed` `{ title }`, `group.described` `{ removed }`, `group.photo` `{ removed }` or `group.lead` `{ botId, name, handle, color, shape }` event, which a bot's history leaves out; the description is in the group's bots' context) · `GET /conversations/limits` → `{ maxGroupSize }` · `GET /conversations/:id/search?q=<1–200 chars>&limit=<1–200>` → the messages holding it ignoring case and accents, newest first · `GET /conversations/:id/links` → `ConversationLink[]`, newest first, each URL once · `DELETE /conversations/:id` → 204 (groups only) · `POST /conversations/:id/members` `{ botId }` (409 `group_full`, `already_member`) · `DELETE /conversations/:id/members/:botId` (409 `group_too_small` for the last bot; removing the lead passes the lead to the next member) · joining and leaving post `member.joined` / `member.left` events `{ botId, name, handle, color, shape, reason? }` (`"<name> joined the group"`, `"<name> left the group"`; `reason: "deleted"` when the bot was deleted, which takes it out of every group and deletes a group left with none) · a bot that left a group and is mentioned there is not run: a `member.absent` event says so · `DELETE /conversations/:id/items` → the conversation, cleared: its items, its bots' brain sessions and the run summaries its runs left (409 `conversation_busy` while a run of it is not over).
- `GET /conversations/:id/items?before=<id>&limit=<n>` → `TimelineItem[]` · `POST /conversations/:id/messages` `{ text, parentId?, attachments? (≤ 10 file ids uploaded to this conversation and not yet sent) }` → 201 `{ item, runs: Run[] }` (400 naming `attachments` for another conversation's file or one already sent) · `POST /conversations/:id/read`.
- Account (change 0064): `GET /auth/config` (no auth) → `AuthConfig` `{ supabase: { url, key } | null, linked }` · `GET /account` → `AccountStatus` `{ available, linked: { userId, email, linkedAt } | null, via: "token"|"account" }` · `POST /account/link` `{ accessToken }` (the hub's token only: 403 `token_required` with a session; 400 `invalid_session`; 409 `accounts_off`) → `AccountStatus`, the account replacing any linked before · `DELETE /account` → `AccountStatus` (every session of the account stops opening the hub) · `POST /stream/ticket` → `{ ticket, expiresAt }` (429 `too_many_tickets` past 100 waiting) · `POST /files/key` → `{ key, expiresAt }`.
- Device (change 0066): `GET /device` → `DeviceStatus` `{ available, linked: { id, name, ownerId, email, linkedAt } | null, pending, lastSyncAt, lastError, revoked }` · `POST /device/link` `{ name (1–80), email?, password? | accessToken? }` (the hub's token only: 403 `token_required`; 401 `sign_in_failed`; 400 `invalid_session`; 409 `already_linked`, `other_account` (the hub is linked to another account), `accounts_off`; 502 `cloud_refused`, `cloud_unreachable`) → `DeviceStatus`: the hub signs in to `<ORBIS_SUPABASE_URL>/auth/v1/token?grant_type=password` itself, calls `rpc/register_device` `{ p_name }` under that session, keeps the answered token as the hub secret `device.token` (never answered), links the account (as `POST /account/link`) and queues every row · `POST /device/sync` (token only) → `DeviceStatus` after sending now · `DELETE /device` (token only) → `DeviceStatus`: `rpc/device_unlink` `{ p_token }`, then the token, the device and the outbox are forgotten. Every 15 s a linked hub posts `rpc/device_sync` `{ p_token, p_table, p_upserts, p_deletes }` (the publishable key, no session; at most 200 rows a call) table by table in the export's order; an answer `device revoked or unknown` (code 28000) makes the device `revoked`: nothing more is sent and its token is forgotten. The cloud's functions are in `supabase/migrations/0002_devices.sql`. `DeviceStatus` also has `cloud: { url, connected, lastError }` (change 0068) and `POST /device/link` takes `cloudUrl?`; `PUT /device/cloud` `{ url: string | null }` (token only; 400 not https, 409 `not_linked`) → `DeviceStatus` sets the Orbis cloud this device relays to.
- Cloud relay (change 0068, ADR 0024): a linked hub with a cloud (`ORBIS_CLOUD_URL`, else `device.cloudUrl`, else the published cloud) opens `GET <cloud>/runner` as a WebSocket with `Authorization: Device <device token>`; the cloud's Worker checks it with `rpc/device_identity` `{ p_token }` (`supabase/migrations/0003_device_identity.sql`) and hands it to the account's Durable Object (close 4409: another hub of the account took it; 1012: renew). JSON frames (`packages/shared/src/relay.ts`): `req {id, method, path, headers, end, ip?}` and `res {id, status, headers, end}`, each body in `data {id, data (base64, ≤ 512 KB), end}` frames (≤ 30 MB); `open {id, path}` → `opened` | `close {id, code: 4401}`, `msg {id, data}` both ways, `close {id}`; `{"t":"ping"}` every 30 s answered `{"t":"pong"}`. The hub answers `req` with its own routes (`inject`, only `/api/` and `/v1/`) and `open` with its stream (`injectWS`, only `/api/v1/stream?…`). Through the cloud, `POST /stream/ticket` and `POST /files/key` answer `<account id>~<the hub's value>`; with no hub connected the cloud answers 503 `runner_offline`; pairing, `/device*`, `POST /account/link` and `DELETE /account` are 404 `not_in_cloud`.
- Export and import (change 0065): `POST /export` `{ password? }` (at least 10 characters to seal the secrets) → `application/zip`, `attachment; filename="orbis-<YYYY-MM-DD>.orbis"`: `manifest.json` `{ format: "orbis-export", formatVersion: 1, schemaVersion, hubVersion, exportedAt, counts, files, skills, secrets, parts: [{ path, sha256, bytes }] }`, `tables/<table>.jsonl` (every table but `secrets`, `brain_sessions`, `memory_fts`, `schema_migrations`; settings without `secret:*`, `account`, `user.lastActiveAt`, `claude.tokenSavedAt`; routines without `secret`; items without `seq`), `files/<fil_id>`, `skills/<name>/SKILL.md`, `bots/<id>/skills/<name>/SKILL.md`, and with a password `secrets.sealed.json` (scrypt N 2^15 r 8 p 1, AES-256-GCM: the bots' secrets, the hub's secrets but MCP OAuth sign-ins, the routines' webhook secrets) · `POST /import` (the file as the raw body, ≤ 512 MB; `x-orbis-export-password`, URI-encoded) → `ImportReport` `{ target: "hub", exportedAt, tables: { <table>: { added, skipped } }, files, skills, secrets: { added, skipped, inFile, opened }, warnings }`; 400 `invalid_export` (not a .orbis file, a part changed or missing or unlisted, a newer format or schema, rows that do not hold together), 400 `wrong_password`, 409 `import_conflict` (another bot or squad has an export's handle; fields `bots.<handle>`, `squads.<handle>`) · `POST /import/cloud` (the file; `x-orbis-account: <the account's session>`) → `ImportReport` with `target: "cloud"`: each table posted to `<ORBIS_SUPABASE_URL>/rest/v1/<table>?on_conflict=owner_id,<key>` with `prefer: resolution=ignore-duplicates,return=representation` under that session; 401 `invalid_session`, 409 `accounts_off`, 502 `cloud_refused`. On import, bots arrive idle and a `host` computer becomes `local`; runs still queued, running or waiting arrive cancelled and pending approvals expired.
- Files (change 0059): `POST /conversations/:id/files` — the file as the raw body (any content type, ≤ 25 MB), its name in `x-file-name` (URI-encoded) → 201 `ConversationFile` with `itemId: null` until a message sends it (an unsent upload is deleted after a day) · `GET /conversations/:id/files` → the sent `ConversationFile[]`, newest first · `GET /files/:id/content?download=1` → the bytes; a file key may come as `?key=` (for `<img>`, players and downloads; change 0064); images, audio, video, PDF and plain text inline, anything else as an attachment; always `content-security-policy: sandbox…` and `x-content-type-options: nosniff`. `ConversationFile`: `{ id: "fil_…", conversationId, name, mime, size, author, itemId, createdAt }`; a `TimelineItem` carrying files has `attachments: fileId[]` and `files: ConversationFile[]`. Clearing or deleting a conversation deletes its files.
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
- `GET /runtimes/claude/account` → `{ installed, version, path, loggedIn, method, detail, job: CliJob|null, token: ClaudeTokenStatus }` (`claude --version`, `claude auth status` with the subscription token when there is one) · `POST /runtimes/claude/login` → 202 `CliJob` (`claude auth login --claudeai`; `url` is the page it prints) · `POST /runtimes/claude/code` `{ code }` → `{ sent: true }` (the code that page shows, typed to the waiting login; 409 `no_sign_in` when none waits) · `POST /runtimes/claude/cancel` → the job · `PUT /runtimes/claude/token` `{ token }` → `ClaudeTokenStatus` `{ saved, source: "saved"|"server"|null, savedAt, expiresAround }` (the token `claude setup-token` prints, kept encrypted and never answered; 400 for an API key `sk-ant-api…` or a value that is not a token) · `DELETE /runtimes/claude/token` → `ClaudeTokenStatus` (CLAUDE_CODE_OAUTH_TOKEN of the hub's environment, if set, then applies).
- `GET /runtimes/codex/account` → `{ installed, version, path, loggedIn, method: "chatgpt"|"api-key"|null, detail, job: CliJob|null }` · `POST /runtimes/codex/install` → 202 `CliJob` (`npm install -g @openai/codex@latest`) · `POST /runtimes/codex/login` `{ device? }` → 202 `CliJob` (`codex login`, or `codex login --device-auth`) · `POST /runtimes/codex/cancel` → the job · `POST /runtimes/codex/logout` → the account. `CliJob`: `{ kind: "install"|"login", state: "running"|"done"|"failed", startedAt, finishedAt, url, code, log, error }`; one job at a time.
- `POST /runtimes/test` `{ botId }` (the bot's brain, with its secrets) or `{ brain }` → `{ kind, ok, reply, error, durationMs, answered }`; `409 test_running` while the same bot or brain kind is being tested.
- `GET /voice` → `{ transcription: { configured, source: "settings"|"env"|"openai"|null, url, model, hasKey } }` (never the key) · `PUT /voice/transcription` `{ url?, model?, apiKey? }` (a value replaces, `null` or `""` clears, absent keeps; 400 for a non-http URL) → the same · `POST /voice/test` → `{ ok, text, durationMs, error }` (a second of silence sent to the service) · `POST /voice/transcribe?lang=<pt-BR|en-US>` with an `audio/*` or `application/octet-stream` body up to 25 MiB → `{ text }`; 503 `transcription_unavailable` when no service is set up, 502 `transcription_failed` when it fails. The hub forwards the audio as `multipart/form-data` (`file` named `speech.<ext>` after the content type, `model`, `language` as two letters, `response_format=json`) to `<url>/audio/transcriptions` with `Authorization: Bearer <key>` when a key is set. The service is the one saved from the settings screen (the key encrypted with the vault's key in the `settings` table), else `ORBIS_TRANSCRIBE_URL`, else `https://api.openai.com/v1` with `OPENAI_API_KEY`; the model defaults to `whisper-1`.
- `GET /mcp/catalog` → the marketplace: `[{ id, name, icon, logo? (a path the web app serves, `/logos/mcp/<id>.svg|png`), category: "research"|"dev"|"work"|"browser"|"files"|"reasoning"|"finance"|"marketing", description: { en, "pt-BR" }, transport: "stdio"|"http", command?, args?, url?, auth: "none"|"token"|"oauth"|"device" (device: the program signs in by itself with a code the user types on the service's page), fields: [{ key, label, secret, target: "env"|"arg"|"bearer"|"query"|"client_id"|"client_secret", placeholder?, help?, link?, optional? }], homepage, needs?, readOnly? (every tool only reads), readOnlyTools? (the tools that only read, for a server that does not mark them itself), oauth?: { authorizationEndpoint, tokenEndpoint, scope, params?, env: { accessToken, refreshToken?, clientId?, clientSecret? } }, connected: serverId|null }]`; a `query` field is a parameter of the address the hub calls, added from the vault on each call and absent from `url` and every error; `client_id`/`client_secret` fields are the user's own OAuth client, and an entry with `oauth` (a stdio program) is signed in by the hub with that client before the program starts — `needs_auth` with its `authUrl` until then — and gets the tokens in the environment variables `oauth.env` names · `GET /mcp/servers` → `McpServer[]` · `POST /mcp/servers` `{ catalogId, values? }` or a custom `{ name, transport, command?, args?, url?, env?, token? }` → 202 `McpServer` with `status: "connecting"` (400 naming `values.<key>` for an empty required field, `catalogId` for an unknown or already connected entry) · `GET /mcp/servers/:id` · `POST /mcp/servers/:id/reconnect` → 202 · `POST /mcp/servers/:id/bots` `{ botId, enabled }` → `McpServer` (adds or removes `mcp.<id>.*` in the bot's allowlist) · `DELETE /mcp/servers/:id` → 204 (its secrets deleted, its patterns removed from every allowlist). `McpServer`: `{ id, name, icon, logo (the catalog entry's, or null), catalogId, transport, url, command, args, auth, status: "connecting"|"connected"|"needs_auth"|"error", error, authUrl (while needs_auth), tools: [{ name: "mcp.<id>.<tool>", remoteName, description, readOnly }], bots: botId[], watchers: botId[] (change 0061: the bots with its tools, initiative on and its MCP updates on), createdAt, updatedAt }`. A server with watchers stays connected (a program started again 15 s, 1, 5 and 15 minutes after it stops; an HTTP server's `GET` stream kept open with its `mcp-session-id`); its `notifications/message` (not `debug`) and `notifications/resources/updated` (the resource read again) are gathered 30 s (20 at most) and reach each watcher as a run of initiative with `trigger.ref: "mcp"`, held through the quiet hours and while the bot works, at most 12 a day per bot; `notifications/tools/list_changed` lists every connected server's tools again; a server's `ping` is answered. A connection whose catalog entry now starts another program (another command or pinned arguments) is `error` with "… disconnect it and connect it again" and offers no tools until it is connected again. Keys, tokens and OAuth sign-ins are hub secrets, never returned.
- `GET /tools` → `[{ name, description, risk, server: string|null }]`, every tool a bot can be given.
- `GET /oauth/mcp/callback?state=&code=` (no prefix, no API token: the one-time state is the proof) → an HTML page; trades the code (PKCE) for tokens and connects the server. The hub registers itself with each authorization server as a public client named "Orbis" with this redirect URI, or uses the user's own client for an entry with `client_id`/`client_secret` fields.
- `GET /openapi.json` → OpenAPI 3.1 document.

- Hiring (specs/hiring): `GET /hiring/tools` → `HiringTool[]` (the computer, browser and web, then every connected MCP server) · `GET /hiring/rounds` → `HiringRound[]`, newest first · `POST /hiring/rounds` `{ basis, brief? (required for a project, ≤ 4000), groupId? (a group, for a team), recruiterId, count (1–30), lang?: "en"|"pt-BR" }` → 202 `HiringRound` with `status: "generating"` (400 naming `brief`, `groupId` or `recruiterId`; 409 `spend_cap_reached`) · `GET /hiring/rounds/:id` · `POST /hiring/rounds/:id/more` `{ count, lang?, recruiterId? }` → 202 (409 `hiring_busy` while it generates) · `DELETE /hiring/rounds/:id` → 204 (the bots hired stay) · `PATCH /hiring/candidates/:id` `{ status: "open"|"dismissed" }` → `HiringRound` · `POST /hiring/candidates/:id/hire` `{ brainFrom?, reportsTo?: string|null, joinGroup?, lang? }` → 202 `HiringRound` with the candidate `hiring` (409 `candidate_not_open`); then the candidate is `hired` with its `botId`, or `open` with the reason in `error`.

- Squads (specs/squads): `GET /squads` → `SquadsView` · `POST /squads` `{ name, description?, color? (#rrggbb), members? (ids or handles; they move from other squads), representativeId?, managerId? }` → 201 `SquadsView` · `PATCH /squads/:id` `{ name?, description?, color?, representativeId?: string|null, managerId?: string|null }` → `SquadsView` (400 for a manager inside the squad, a representative outside it, or a loop of managers) · `DELETE /squads/:id` → `SquadsView` (its bots in no squad; its chat stays a group) · `PUT /squads/:id/members/:botId` / `DELETE …` → `SquadsView` · `POST /squads/manager` `{ managerId: string|null }` → `SquadsView` (one manager for every squad it is not in). After each change: members report to the representative, the representative to the manager, the squads' groups and the room follow.

### Stream (`/api/v1/stream`)

- Client → hub: `{ "type": "subscribe", "conversations"?: string[] }`, `{ "type": "ping" }`.
- Hub → client: `{ "type": "subscribed", "data": { conversations }, ... }` acknowledges each subscribe; events after it are never missed.
- Hub → client: `{ "type": "<event>", "data": {...}, "ts": "<ISO-8601>" }` where `<event>` is one of `bot.state` `{ botId, state }`, `bot.updated` `{ bot }`, `bot.deleted` `{ botId }`, `bot.report` `{ botId, conversationId, itemId, text }` (a bot's `report` run replied: it came back to the user on its own), `conversation.updated` `{ conversation }`, `conversation.deleted` `{ conversationId }`, `conversation.cleared` `{ conversationId }`, `timeline.item` `{ conversationId, item }`, `run.updated` `{ run }` (steps omitted), `run.step` `{ runId, conversationId, botId, step }`, `approval.requested` `{ approval }`, `approval.resolved` `{ approval }`, `computer.updated` `{ botId, computer: ComputerStatus }`, `mcp.updated` `{ server: McpServer }`, `mcp.deleted` `{ serverId }`, `hiring.updated` `{ round: HiringRound }`, `hiring.deleted` `{ roundId }`, `squads.updated` `SquadsView`, `pong`. Account-wide (sent to every subscriber): `bot.*`, `approval.*`, `computer.updated`, `mcp.*`, `hiring.*`, `squads.updated`, `pong`.

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
