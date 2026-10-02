# Brains: subscription, local or API

Every bot has a `brain` configuration:

```json
{ "kind": "claude-code", "model": "sonnet", "timeoutSec": 900 }
```

| Field | Used by | Meaning |
|-------|---------|---------|
| `kind` | all | `claude-code`, `codex`, `gemini-cli`, `cursor`, `ollama`, `lmstudio`, `anthropic`, `openai`, `chat-http`, `custom-cli`, `mock` |
| `model` | most | model id or alias passed to the brain (required for `openai`, `ollama`, `lmstudio`) |
| `command` | CLI brains | executable; defaults to `claude`, `codex`, `gemini`, or `cursor-agent`/`agent` |
| `args` | CLI brains | arguments placed before the adapter's own (for `custom-cli`, the whole argv; `{prompt}` is replaced by the prompt) |
| `timeoutSec` | all | run timeout, default 900 |
| `baseUrl`, `apiKeySecret` | API and local brains | endpoint and the name of the bot secret holding the key (local servers need none) |

A new bot uses **Claude Code** unless you pick another brain. To see which
brains your machine has and prove one answers, open **⚙ Settings** in the web
app (below).

## Subscription brains (no API key)

Orbis drives the agent CLI you already pay for, headless, as a child process:

- working directory: the bot's own workspace (`~/.orbis/bots/<id>/workspace`);
- environment: built from scratch — `PATH`, `HOME`, locale, proxies and the
  CLI's own login location (`CLAUDE_CONFIG_DIR`, `CODEX_HOME`); **no**
  `ORBIS_*` variable and **no** `ANTHROPIC_API_KEY` / `OPENAI_API_KEY`, so the
  CLI always uses your subscription login;
- output: parsed line by line into Orbis's normalized events, so the web app
  shows each step (thinking, tool calls and results) live.

### Claude Code

```
claude -p <task> --output-format stream-json --verbose \
  --append-system-prompt <identity, rules, memories> [--model <model>] \
  (--session-id <new uuid> | --resume <stored uuid>)
```

The first run of a bot in a conversation starts a new Claude Code session;
every later run resumes it, so the bot keeps the whole conversation in Claude
Code's own context and Orbis only sends what is new. When a stored session no
longer exists, Orbis starts a fresh one automatically.

Setup on your machine: `npm i -g @anthropic-ai/claude-code`, run `claude` once
and log in with your Claude subscription. Then:

```bash
orbis bots create --name "Dev" --role "Engineering" --brain claude-code --model sonnet
```

**The login expires.** Claude Code keeps its own login, and a bot runs on it.
When it expires, a test or a run fails with *"Failed to authenticate: OAuth
session expired and could not be refreshed"*. Orbis adds how to renew it, and
the Claude Code card in ⚙ → Brains has the way: **Sign in again** runs
`claude auth login` on the hub's machine — the browser opens there; if the page
shows a code, paste it in the box under the button (the page's address is also
shown, so it works when you reach Orbis from another device). Sign in, press
**Test**, done. The same from a terminal: `claude auth login`.

### Codex (ChatGPT subscription)

```
codex exec --json --skip-git-repo-check --sandbox workspace-write --cd <workspace> [-m <model>] \
  -c mcp_servers.orbis.command=… -c mcp_servers.orbis.args=[…] -c mcp_servers.orbis.env={…} \
  [resume <thread-id>] <prompt>
```

Codex runs in its own `workspace-write` sandbox limited to the bot's
workspace; the thread id of the first run is stored and resumed on the next.

**Your paid ChatGPT plan, no API key.** A ChatGPT plan (Plus, Pro, Business,
Edu, Enterprise) includes Codex, and the Codex CLI signs in with the ChatGPT
account — that is OpenAI's own way to use the subscription outside
chatgpt.com. In **⚙ Settings → Brains → ChatGPT with your subscription**:

1. **Install Codex** runs `npm install -g @openai/codex` (Node.js needed).
2. **Sign in with ChatGPT** runs `codex login`: an OpenAI page opens on the
   computer that runs Orbis (the card also links to it). **Sign in with a
   code** runs `codex login --device-auth`: open
   `https://auth.openai.com/codex/device` on any device and type the code the
   card shows. Codex keeps the sign-in in `~/.codex`; Orbis never sees the
   password or the tokens.
3. Pick the brain **Codex CLI (your ChatGPT account, no API)** for a bot, and
   **Test** proves a model answers. Usage counts against your plan's limits.

By hand it is the same: `npm i -g @openai/codex`, `codex login` (or
`codex login --device-auth`), `codex login status`. Orbis does not drive
the chatgpt.com website: that is not an interface OpenAI offers for
programs, and its terms do not allow automating it.

### Gemini CLI (Google account)

Before each run Orbis writes the Orbis MCP server into
`<workspace>/.gemini/settings.json` (and restores the file afterwards, so the
run token never stays on disk), then runs
`gemini -p <prompt> --output-format stream-json [-m <model>]`. Setup:
`npm i -g @google/gemini-cli`, run `gemini` once and sign in with Google.

### Cursor CLI (Cursor subscription)

Before each run Orbis writes the Orbis MCP server into
`<workspace>/.cursor/mcp.json` and allows its tools with `Mcp(orbis:*)` in
`<workspace>/.cursor/cli.json` (both restored afterwards, so the run token
never stays on disk), then runs

```
agent -p --output-format stream-json --trust --workspace <workspace> --approve-mcps \
  [--model <model>] [--resume <chat-id>] <prompt>
```

The chat id of the first run is stored and resumed on the next. Orbis never
passes `--force`: Cursor's own shell and file-writing tools follow Cursor's
permission rules, and the bot's Orbis tools follow the Orbis policy and
approvals. Cursor reports no token counts, so its runs show in the usage
screen with zero tokens. Setup: install the Cursor CLI
(`curl https://cursor.com/install -fsS | bash`, or on Windows
`irm 'https://cursor.com/install?win32=true' | iex`), then `agent login`.

```bash
orbis bots create --name "Dev" --brain cursor
```

### Windows

A CLI installed with `npm i -g` is a `.cmd` file on Windows. Node.js cannot
start it without `cmd.exe`, which cuts a multi-line prompt at its first line
break, so Orbis reads the `.cmd` file and runs the Node.js script it points
to directly. Programs installed as `.exe` (such as Claude Code's native
installer) run as they are. A batch file that points to no script fails the
run with a message asking you to set the brain's `command` to the program's
`.exe` or `.js` file.

## Which brains do I have, and does it really answer?

**⚙ Settings** in the web app lists:

- the subscription CLIs on the hub's machine (installed or not, version,
  path, and how to install the missing ones);
- the local model servers (Ollama, LM Studio): running or not, and their
  models;
- your bots with the brain and model each one uses, and a **Configure**
  button that opens the bot's settings.

**Test** asks the brain `What is 17 × 23? Answer with the number only.` with
no tools and no history, in a scratch folder removed afterwards, and shows
the reply and how long it took. A model answers **391**; the mock brain only
echoes the question, so the screen says no model answered. On a subscription
brain the test uses a little of your quota. The same from a terminal:

```bash
orbis runtimes check                   # CLIs and local servers
orbis runtimes test claude-code        # ✓ claude-code answered in 4.2s: 391
orbis runtimes test ollama --model llama3.2
orbis runtimes test @ana               # the bot's own brain, with its secrets
```

When a CLI brain runs, the hub log also shows `POST /mcp` requests: that is
the CLI (Claude Code, Codex, Gemini CLI or Cursor) connecting to the Orbis
tool server, one short handshake per run.

## Local models (`ollama`, `lmstudio`) — no API, no subscription

The model runs on your computer; Orbis talks to the server's
OpenAI-compatible API with no key. `model` is required, and the web app
suggests the models the server has.

| Brain | Default address | Setup |
|-------|-----------------|-------|
| `ollama` | `http://127.0.0.1:11434/v1` (`ORBIS_OLLAMA_URL`) | install Ollama, `ollama pull llama3.2`, keep it running |
| `lmstudio` | `http://127.0.0.1:1234/v1` (`ORBIS_LMSTUDIO_URL`) | download a model in LM Studio, then Developer → Start server |

```bash
orbis bots create --name "Llama" --brain ollama --model llama3.2
orbis bots create --name "Qwen" --brain lmstudio --model qwen3-4b --base-url http://192.168.0.10:1234/v1
```

Many small local models cannot call tools. When the server answers that the
model does not support tools, the run carries on without them and says so in
its steps; the bot then answers from the conversation alone.

## API brains

### Anthropic (`anthropic`)

Built on the official `@anthropic-ai/sdk`: a streaming tool loop where every
tool call goes through the Orbis gateway and its approvals. Defaults:
`claude-opus-5`, adaptive thinking with summarized reasoning shown as steps,
prompt caching of the system prompt, and on first-party Claude Opus 5 / Opus
5.5 / Fable 5.1 the server-side refusal fallback (`fallbacks: "default"`), so
a declined request is retried by the API on the model it recommends. A turn
that stops on `refusal`, or on `max_tokens` while holding a tool call, fails
the run without executing anything. Key: `ANTHROPIC_API_KEY` on the hub (or a
per-bot secret in a later change).

```bash
orbis bots create --name "Researcher" --brain anthropic --model claude-opus-5
```

### OpenAI-compatible (`openai`)

Chat Completions with streaming and function calling, for any compatible
server (OpenAI, OpenRouter, Groq, vLLM). `model` is required; `baseUrl`
defaults to OpenAI. A server on localhost needs no key (for Ollama and LM
Studio, prefer their own brains above):

```bash
# OpenRouter
OPENAI_API_KEY=sk-or-... orbis serve
orbis bots create --name "Router" --brain openai --model anthropic/claude-sonnet-5 --base-url https://openrouter.ai/api/v1
```

Costs are computed from the price table in `packages/hub/src/brains/pricing.ts`
(Anthropic list prices); local models cost nothing.

### A chat API over cURL (`chat-http`)

For a chat you use in the browser (a company assistant, say) whose requests a
browser shows as a cURL command: a `POST` with a **Bearer token** and a
`multipart/form-data` body with one `data` field —

```json
{"context":{"chatId":""},"agent":{"agentId":"chat-corporativo","version":"1.0.0"},
 "input":{"role":"user","content":"…"},
 "config":{"temperature":0.25,"maxTokens":64000,"modelId":"claude-4-6-opus", …},
 "extensions":{"features":{"enableStreaming":true, …}}}
```

In the bot's settings (⚙ → Brain → **Chat API over cURL**), give the request's
**address** and the **Bearer token** — or open the chat in the browser, open
DevTools → Network, send a message, right-click the request → **Copy as cURL**,
paste it in the bot's settings and press **Fill in from the cURL**: the address,
the token, the agent, the model and the `Origin` are read from it.

- The token is saved as the bot's secret `CHAT_BEARER_TOKEN`, encrypted in the
  vault; it never comes back to the browser, never reaches the model, and is
  never written in the bot or its exported template. The address stays in the
  bot and is left out of exported templates too: Orbis's code names none.
- A browser session's token expires (often in an hour or two). Orbis reads its
  expiry and says so before calling ("the Bearer token expired at …"), and a
  `401` says the same: paste a new token or cURL and save.
- The company chat's own stream — `stream_started` (with the `chatId`),
  `message_chunk` (`{"delta": …}`) and `message_complete` (`data.context.content`
  with the whole answer, `data.metadata.chatId` and `tokenUsage`) — is read
  directly: the reply, the chat to continue and the tokens come from
  `message_complete`, without the `[FOLLOW_UP_QUESTIONS]` block, and the history
  is not asked.
- The answer may stream as server-sent events, JSON lines, one JSON document or
  plain text; Orbis takes the text from the usual fields (`content`, `text`,
  `delta`, `answer`, `message`, OpenAI-style `choices`), joins pieces or takes a
  growing answer whole, and skips status and reference events. When it finds
  no text, the run's error shows how the answer began — send that to whoever
  maintains Orbis to add the format.
- When the server returns a chat id (`chatId`, `chat_id`, `conversationId`),
  the bot continues that chat: later messages send only what is new.
- The chats' history is the reliable record, and Orbis reads it after each
  message, at `history/chats` beside the request address (or the address in
  Advanced): `GET …/history/chats/<chat id>` — a `data.chat` with its
  `messages`, each with `role`, `content` and `usage` — gives the reply that
  follows the message just sent and its tokens (`promptTokens`,
  `completionTokens`); the streamed text is the fallback. When the answer named
  no chat, the newest chats
  (`GET …/history/chats?page=1&pageSize=5&sortBy=updatedAt&sortOrder=desc`) are
  searched for the one holding the message just sent — a chat you have open in
  the browser is never taken. A server without that history is asked once.
- **The token you paste is cleaned**: with or without `Bearer`, a whole
  `Authorization: Bearer …` line, in quotes, or wrapped over lines — Orbis keeps
  just the token. Below the token field the settings say whether one is saved in
  the vault and when it expires (`GET /api/v1/bots/<id>/chat-token` answers
  `{ saved, expiresAt, expired }`; the token itself never leaves the vault).
- **HTTP 403 with a token that has not expired** is the server — or a firewall in
  front of it, such as Cloudflare ("Sorry, you have been blocked") — refusing
  something besides the token. Two things matter, and Orbis does both:
  - **How the request is made.** A firewall looks at how the client speaks
    (HTTP/2, the TLS handshake), and Node's own HTTP client does not look like a
    browser. So Orbis makes the requests with the system's **`curl`** (the
    `curl.exe` of Windows 10 and later, the same program as your "Copy as cURL"),
    and falls back to Node when there is no curl. In **Advanced → HTTP call**
    you can force one (`transport`: `curl` or `fetch`). The token travels in a
    private temporary file, never on curl's command line.
  - **What the browser sends with it.** Paste the request's cURL (**Fill in
    from the cURL**): besides the address and the token, Orbis copies `Origin`
    and the browser's `User-Agent`, `Accept-Language`, `Referer`, `sec-ch-ua*`,
    `sec-fetch-*`, `cache-control`, `pragma` and `priority` (never a cookie, an
    API key or `Authorization`) and sends them with every request to the chat
    API: the message, the history and the title.

  - **The way out of the computer.** A company firewall may let through only
    what comes from the company's proxy — the one the browser and Postman use,
    set in Windows (often by a PAC script). curl ignores it, so Orbis asks
    Windows which proxy it would use for the chat's address and gives it to
    curl, signing in to it as the logged-in user (`--proxy-user :`, NTLM or
    Kerberos). `HTTPS_PROXY`, when set, comes first. In **Advanced** you can
    name the **curl program** (say, Git Bash's) and the **proxy** (`direct` for
    none).

  **Test connection** (in the bot's settings) tries every way at once — each
  curl on the computer (the one on PATH, Windows' own, Git's), through each
  proxy it knows and with none, and Node — with a GET of the chats' list (no
  message, no model call), and shows which ones the firewall let through; **Use
  this way** fills the settings with one of them (`POST /api/v1/bots/<id>/chat-check`).

  The run's error says what the server answered, whether it was the firewall,
  what Orbis sent and which way it went. A `401`, or a `403` after the token's
  expiry, is the token: paste a new one. A template never carries the curl
  program or the proxy, and an imported one cannot set them.
- A bot's template export leaves out every address of this brain (the request
  address, `Origin`, the history address and the browser headers).
- A chat the bot opens gets a title, as the browser gives one:
  `POST …/history/chats/<chat id>/generate-title` with
  `{"data":{"userMessage":"Orbis · <bot> — <task>"}}`, once per new chat and in
  the background — a failed title never fails the run. It costs one model call
  per new chat; turn it off in Advanced (**Give new chats a title**).
- Pasting a cURL that only reads (a `GET`, like the history's) keeps the
  request address and takes its token — a quick way to renew an expired token —
  and, for a history request, the history's address.
- Such an API calls no tools, so Orbis's tools travel as text: the bot is told
  to ask for one in a ` ```tool ` block (`{"name": "…", "input": {…}}`), Orbis
  runs it (approvals included) and sends the result as the next message.
- From the CLI: `orbis bots create --name Analista --brain chat-http`, then set
  `baseUrl` with `PATCH /api/v1/bots/<id>` and the token with
  `orbis secrets set @analista CHAT_BEARER_TOKEN`.

Check with your company that using its chat this way is allowed.

### Your own command (`custom-cli`)

Any program that reads a prompt from stdin (or from a `{prompt}` argument) and
prints the reply:

```bash
curl -s -H "authorization: Bearer $(cat ~/.orbis/token)" -H 'content-type: application/json' \
  -d '{"name":"Llama","brain":{"kind":"custom-cli","command":"ollama","args":["run","llama3.2","{prompt}"]}}' \
  http://127.0.0.1:7420/api/v1/bots
```

## The mock brain

Deterministic and offline, for tests and demos. Directives, one per line:
`/reply <text>`, `/tool <name> <json>`, `/sleep <ms>`, `/fail <message>`;
anything else is echoed back.
