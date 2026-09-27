# Brains: API or subscription

Every bot has a `brain` configuration:

```json
{ "kind": "claude-code", "model": "sonnet", "timeoutSec": 900 }
```

| Field | Used by | Meaning |
|-------|---------|---------|
| `kind` | all | `claude-code`, `codex`, `gemini-cli`, `custom-cli`, `anthropic`, `openai`, `mock` |
| `model` | most | model id or alias passed to the brain |
| `command` | CLI brains | executable; defaults to `claude`, `codex` or `gemini` |
| `args` | CLI brains | arguments placed before the adapter's own (for `custom-cli`, the whole argv; `{prompt}` is replaced by the prompt) |
| `timeoutSec` | all | run timeout, default 900 |
| `baseUrl`, `apiKeySecret` | API brains | endpoint and the name of the bot secret holding the key |

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

### Codex (ChatGPT subscription)

```
codex exec --json --skip-git-repo-check --sandbox workspace-write --cd <workspace> [-m <model>] \
  -c mcp_servers.orbis.command=… -c mcp_servers.orbis.args=[…] -c mcp_servers.orbis.env={…} \
  [resume <thread-id>] <prompt>
```

Codex runs in its own `workspace-write` sandbox limited to the bot's
workspace; the thread id of the first run is stored and resumed on the next.
Setup: `npm i -g @openai/codex`, then `codex login` with your ChatGPT account.

### Gemini CLI (Google account)

Before each run Orbis writes the Orbis MCP server into
`<workspace>/.gemini/settings.json` (and restores the file afterwards, so the
run token never stays on disk), then runs
`gemini -p <prompt> --output-format stream-json [-m <model>]`. Setup:
`npm i -g @google/gemini-cli`, run `gemini` once and sign in with Google.

### Which CLIs do I have?

```bash
orbis runtimes check     # ✓ claude-code 2.1.x  ✗ codex "codex" not found on PATH  …
```

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
server. `model` is required; `baseUrl` defaults to OpenAI. A server on
localhost needs no key:

```bash
# Ollama (free, local)
orbis bots create --name "Llama" --brain openai --model llama3.2 --base-url http://localhost:11434/v1
# OpenRouter
OPENAI_API_KEY=sk-or-... orbis serve
orbis bots create --name "Router" --brain openai --model anthropic/claude-sonnet-5 --base-url https://openrouter.ai/api/v1
```

Costs are computed from the price table in `packages/hub/src/brains/pricing.ts`
(Anthropic list prices); local models cost nothing.

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
