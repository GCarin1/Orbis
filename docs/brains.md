# Brains: API or subscription

Every bot has a `brain` configuration:

```json
{ "kind": "claude-code", "model": "sonnet", "timeoutSec": 900 }
```

| Field | Used by | Meaning |
|-------|---------|---------|
| `kind` | all | `mock`, `claude-code`, `custom-cli` today; `anthropic`, `openai`, `codex`, `gemini-cli` in the brains change |
| `model` | most | model id or alias passed to the brain |
| `command` | CLI brains | executable; defaults to `claude` for `claude-code` |
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
