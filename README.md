# Orbis

**A self-hosted, open-source team of persistent AI bots.** Each bot has a name,
a role, durable rules, its own memory and its own computer; it works on a task
from start to finish, hands work to other bots and stops for your approval
before anything risky. You reach the same bots from a **web app**, a **desktop
app**, the **`orbis` CLI** and an **HTTP API**.

A bot's brain is your choice, per bot:

| Brain | How it runs | Needs an API key? |
|-------|-------------|-------------------|
| `claude-code` | Claude Code CLI, headless, with your **Claude subscription** login | **No** |
| `codex` | OpenAI Codex CLI with your **ChatGPT** login | **No** |
| `gemini-cli` | Google Gemini CLI with your **Google account** | **No** |
| `custom-cli` | any command that reads a prompt and prints a reply | depends |
| `anthropic` | Anthropic Messages API | yes |
| `openai` | any OpenAI-compatible API: OpenAI, OpenRouter, **Ollama**, LM Studio, vLLM | yes, except local servers |
| `mock` | deterministic, offline — for tests and demos | no |

> 🇧🇷 Leia em português: [README.pt.md](README.pt.md)

## Status

Orbis is built spec-first with [Doctrina](https://github.com/GCarin1/Doctrina):
the product, 17 capability specs, the integration contracts and the
architecture decisions live in [`.doctrina/`](.doctrina/). Every capability is
delivered by one Doctrina change and closes only when its acceptance criteria
are proven by tests.

| Capability | State |
|------------|-------|
| Bots (identity, rules, avatar, state, pin/hide/duplicate/delete) | ✅ verified |
| Direct conversations, threads, reactions, run queue, live stream | ✅ |
| Brains: `mock`, `claude-code` (session resume), `custom-cli` | ✅ |
| Context assembly (identity, memories, recent conversation within budget) | ✅ |
| REST API + WebSocket stream + OpenAPI, bearer token | ✅ |
| `orbis` CLI: `serve`, `login`, `open`, `bots`, `chat` | ✅ |
| Web app: roster, timeline with run steps, pt-BR/English, installable | ✅ |
| Tool gateway (MCP), approvals and drafts | next |
| API brains, Codex, Gemini CLI, OpenAI-compatible endpoint | planned |
| Groups, @mentions, handoff, memory tools | planned |
| One computer per bot (local and Docker, browser, live view, takeover) | planned |
| Skills, routines, secrets, usage caps, templates, desktop app | planned |

The status of each capability is always current in
`npx doctrina status` and in each spec's `Implementation:` header.

## Quick start

Requirements: Node.js 22.12 or later. For the subscription brains, install
and log in to the CLI you pay for (for example `npm i -g @anthropic-ai/claude-code`
then `claude` once to log in).

```bash
git clone https://github.com/GCarin1/Orbis && cd Orbis
npm install
npm run build

# start the hub (API + stream + web app) on http://127.0.0.1:7420
node packages/cli/dist/index.js serve
```

In a second terminal:

```bash
alias orbis="node $(pwd)/packages/cli/dist/index.js"

orbis bots create --name "Ana" --role "QA" \
  --description "You are the QA analyst. Never send anything without my approval." \
  --brain claude-code
orbis chat @ana "Summarise what a smoke test should cover for a login page"
orbis chat @ana            # interactive session; the bot resumes its Claude Code session
orbis open                 # opens the web app already signed in
```

The hub keeps everything in `~/.orbis` (`ORBIS_DATA_DIR`): the SQLite
database, the API token (`~/.orbis/token`) and each bot's workspace.

## How it fits together

```
 web app ─┐                         ┌─ mock
 desktop ─┤  REST + WebSocket       ├─ claude-code ─┐
 orbis CLI┼──────────────► HUB ─────┼─ custom-cli   ├─ child process in the
 HTTP API ┘  (one port, one token)  ├─ codex*       │  bot's own workspace,
                                    ├─ gemini-cli*  ┘  your CLI login
                                    ├─ anthropic*  ─┐
                                    └─ openai*     ─┴─ HTTP to the model API
                  SQLite · run engine · per-bot computer        (* planned)
```

- **The hub** (`packages/hub`) owns bots, conversations, runs, memory and the
  run engine: one FIFO queue per bot and conversation, a state machine
  (`idle → thinking → working → waiting → blocked/done`), and normalized run
  events (`run.started`, `step.thinking`, `step.text`, `step.tool_call`,
  `step.tool_result`, `run.usage`, `run.finished`, `run.failed`) whatever the
  brain.
- **Subscription brains** run as child processes in the bot's workspace with a
  scrubbed environment: no Orbis token, no API key, no secret reaches them, so
  the CLI bills your subscription and never an API key by accident.
- **Clients** only use the public API documented in
  [`docs/api.md`](docs/api.md) and at `GET /api/v1/openapi.json`.

More in [`docs/architecture.md`](docs/architecture.md),
[`docs/brains.md`](docs/brains.md) and [`docs/cli.md`](docs/cli.md).

## Configuration

Every variable is optional; see [`.env.example`](.env.example).

| Variable | Default | Meaning |
|----------|---------|---------|
| `ORBIS_PORT` / `ORBIS_HOST` | `7420` / `127.0.0.1` | where the hub listens |
| `ORBIS_DATA_DIR` | `~/.orbis` | database, token, workspaces |
| `ORBIS_TOKEN` | generated into `~/.orbis/token` | API bearer token |
| `ORBIS_MAX_BOTS` | `50` | bots per installation |
| `ORBIS_MAX_GROUP_SIZE` | `6` | bots per group |
| `ORBIS_COMPUTER_PROVIDER` | `local` | `local` or `docker` |
| `ORBIS_URL` | `http://127.0.0.1:7420` | hub URL for the CLI |

## Development

```bash
npm test                      # all Vitest projects (shared, hub, cli, web, e2e)
npx vitest run --project hub  # one project
npx doctrina verify           # the gate: typecheck → test → build
npm run dev:web               # Vite dev server on :5173 proxying to a running hub
```

The e2e project drives a real Chromium through Playwright; install it once with
`npx playwright-core install chromium` or point `ORBIS_BROWSER_EXECUTABLE` at a
Chromium binary.

Changes follow Doctrina: `npx doctrina prime` to orient, `npx doctrina work
"<request>"` to open a change, `npx doctrina close <id>` to finish it. See
[`AGENTS.md`](AGENTS.md).

## License

MIT.
