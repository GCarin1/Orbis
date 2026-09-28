# HTTP API

The hub listens on `http://127.0.0.1:7420` by default. The complete, current
list of routes and shapes is owned by
[`.doctrina/contracts/hub-surface.md`](../.doctrina/contracts/hub-surface.md);
the running hub also serves an OpenAPI 3.1 document at
`GET /api/v1/openapi.json`.

## Authentication

Every `/api/*` and `/v1/*` request carries `Authorization: Bearer <token>`.
The token is `ORBIS_TOKEN`, or the content of `~/.orbis/token` (created at
first start with mode 0600). `GET /health` needs no token. The stream takes
the token as a query parameter because browsers cannot set WebSocket headers.

Errors always have one shape:

```json
{ "error": { "code": "invalid_request", "message": "…", "fields": { "name": "…" } } }
```

## Bots

```bash
TOKEN=$(cat ~/.orbis/token); H="authorization: Bearer $TOKEN"
curl -s -H "$H" -H 'content-type: application/json' \
  -d '{"name":"Ana","role":"QA","brain":{"kind":"claude-code"}}' \
  http://127.0.0.1:7420/api/v1/bots
curl -s -H "$H" http://127.0.0.1:7420/api/v1/bots            # roster (pinned first)
curl -s -H "$H" http://127.0.0.1:7420/api/v1/bots/ana        # by handle or id
curl -s -X PATCH -H "$H" -H 'content-type: application/json' -d '{"pinned":true}' http://127.0.0.1:7420/api/v1/bots/ana
curl -s -X PATCH -H "$H" -H 'content-type: application/json' -d '{"reportsTo":"chief"}' http://127.0.0.1:7420/api/v1/bots/ana   # manager (null clears)
curl -s -X POST -H "$H" http://127.0.0.1:7420/api/v1/bots/ana/duplicate
curl -s -X DELETE -H "$H" http://127.0.0.1:7420/api/v1/bots/ana   # destroys memory, secrets, computer
curl -s -H "$H" http://127.0.0.1:7420/api/v1/bots/ana/export > ana.orbis.yaml   # a template (templates.md)
curl -s -H "$H" -H 'content-type: application/json' -d "$(jq -n --rawfile y ana.orbis.yaml '{yaml: $y}')" \
  http://127.0.0.1:7420/api/v1/bots/import
```

## Talking to a bot

```bash
CONV=$(curl -s -H "$H" http://127.0.0.1:7420/api/v1/bots/ana/conversation | jq -r .id)
curl -s -H "$H" -H 'content-type: application/json' -d '{"text":"hello"}' \
  http://127.0.0.1:7420/api/v1/conversations/$CONV/messages     # → { item, runs }
curl -s -H "$H" "http://127.0.0.1:7420/api/v1/conversations/$CONV/items?limit=50"
curl -s -H "$H" http://127.0.0.1:7420/api/v1/runs/<runId>          # steps, usage, reply
```

## Groups

```bash
curl -s -H "$H" -H 'content-type: application/json' \
  -d '{"title":"Release","members":["ana","bob"],"leadBotId":"bob"}' \
  http://127.0.0.1:7420/api/v1/conversations                        # → 201 group
curl -s -H "$H" -H 'content-type: application/json' -d '{"text":"@ana status?"}' \
  http://127.0.0.1:7420/api/v1/conversations/<groupId>/messages     # runs: Ana only
curl -s -X POST -H "$H" -H 'content-type: application/json' -d '{"botId":"cara"}' \
  http://127.0.0.1:7420/api/v1/conversations/<groupId>/members
curl -s -X DELETE -H "$H" http://127.0.0.1:7420/api/v1/conversations/<groupId>/members/ana
```

A group has 2 to 6 members: 400 below, 409 `group_full` above, 409
`group_too_small` when a removal would leave one. `PATCH /conversations/:id`
renames it or changes the lead; `DELETE` removes it. See
[collaboration.md](collaboration.md) for routing, handoff cards and the depth
limit.

## Memory

```bash
curl -s -H "$H" http://127.0.0.1:7420/api/v1/bots/ana/memory          # Ana's entries
curl -s -H "$H" -H 'content-type: application/json' -d '{"kind":"preference","text":"Reports in Portuguese"}' \
  http://127.0.0.1:7420/api/v1/bots/ana/memory
curl -s -H "$H" "http://127.0.0.1:7420/api/v1/memory?scope=team"       # team entries
curl -s -H "$H" -H 'content-type: application/json' -d '{"kind":"fact","text":"Staging lives at qa.acme.test"}' \
  http://127.0.0.1:7420/api/v1/memory
curl -s -X PATCH -H "$H" -H 'content-type: application/json' -d '{"text":"…"}' http://127.0.0.1:7420/api/v1/memory/<id>
curl -s -X DELETE -H "$H" http://127.0.0.1:7420/api/v1/memory/<id>
```

## Computer

```bash
curl -s -H "$H" http://127.0.0.1:7420/api/v1/bots/ana/computer        # { provider, status, takeover, vncPath, … }
curl -s -X POST -H "$H" http://127.0.0.1:7420/api/v1/bots/ana/computer/start
curl -s -X POST -H "$H" http://127.0.0.1:7420/api/v1/bots/ana/computer/takeover   # the bot's tools wait…
curl -s -X POST -H "$H" http://127.0.0.1:7420/api/v1/bots/ana/computer/release    # …until you hand it back
curl -s -H "$H" -o shot.png http://127.0.0.1:7420/api/v1/bots/ana/computer/screenshot
```

A failing provider (for example no Docker daemon) answers 409
`computer_unavailable` with docker's own message; a disabled computer answers
409 `computer_disabled`. For a docker computer, `POST
/api/v1/bots/:id/computer/vnc-session` returns the noVNC URL and sets the
path-scoped cookie the viewer uses. See [computer.md](computer.md).

## Skills and routines

```bash
curl -s -H "$H" -H 'content-type: application/json' \
  -d "$(jq -n --rawfile c SKILL.md '{content: $c}')" http://127.0.0.1:7420/api/v1/skills
curl -s -H "$H" "http://127.0.0.1:7420/api/v1/skills?botId=ana&offered=true"
curl -s -H "$H" -H 'content-type: application/json' \
  -d '{"name":"Daily","trigger":{"type":"cron","cron":"0 9 * * 1-5","timezone":"America/Sao_Paulo"},"instruction":"Post the QA report"}' \
  http://127.0.0.1:7420/api/v1/bots/ana/routines                     # → 201, with the webhook secret
curl -s -X POST -H "$H" http://127.0.0.1:7420/api/v1/routines/<id>/test     # → 202, a draft-only run
curl -s -X POST -H "$H" http://127.0.0.1:7420/api/v1/routines/<id>/enable   # 409 untested without a passing test
# A webhook routine, signed with its secret:
BODY='{"ref":"refs/heads/main"}'
SIG="sha256=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$SECRET" -hex | cut -d' ' -f2)"
curl -s -H "X-Orbis-Signature: $SIG" -H 'content-type: application/json' -d "$BODY" http://127.0.0.1:7420/hooks/routines/<id>
```

See [skills-and-routines.md](skills-and-routines.md).

## Secrets and usage

```bash
curl -s -X PUT -H "$H" -H 'content-type: application/json' -d '{"value":"ghp_…"}' \
  http://127.0.0.1:7420/api/v1/bots/ana/secrets/GITHUB_TOKEN       # values never come back
curl -s -H "$H" http://127.0.0.1:7420/api/v1/bots/ana/secrets             # [{ name, createdAt }]
curl -s -H "$H" -H 'content-type: application/json' -d '{"value":"…"}' \
  http://127.0.0.1:7420/api/v1/cards/<itemId>/secret                # answer a secret-request card ({"decline":true} declines)
curl -s -H "$H" "http://127.0.0.1:7420/api/v1/usage?from=2026-09-01&to=2026-10-01"
```

See [secrets-and-usage.md](secrets-and-usage.md).

## Stream

`ws://127.0.0.1:7420/api/v1/stream?token=<token>` — send
`{"type":"subscribe","conversations":["cnv_…"]}` (omit `conversations` for
everything). Events: `bot.state`, `bot.updated`, `bot.deleted`,
`bot.report` (a manager came back on its own: `{ botId, conversationId, itemId, text }`),
`conversation.updated`, `conversation.deleted`, `timeline.item`, `run.updated`, `run.step`,
`approval.requested`, `approval.resolved`, `computer.updated`. Account-wide
events (`bot.*`, `approval.*`, `computer.updated`) reach every subscriber.
A run's `trigger.type` is `message`, `handoff`, `mention`, `report` (a bot's
follow-up once everything it handed off in one run has ended), `routine`,
`webhook` or `api`. See [collaboration.md](collaboration.md).

## OpenAI-compatible endpoint

Any OpenAI client can talk to a bot: the model is `orbis:<handle>`, the key is
the Orbis token, and the message lands in the bot's direct conversation (you
see it in the web app too).

```python
import os
from openai import OpenAI
client = OpenAI(base_url="http://127.0.0.1:7420/v1", api_key=open(os.path.expanduser("~/.orbis/token")).read().strip())
reply = client.chat.completions.create(model="orbis:ana", messages=[{"role": "user", "content": "status of the release?"}])
print(reply.choices[0].message.content)
```

`GET /v1/models` lists one `orbis:<handle>` model per visible bot. With
`stream: true` the reply arrives as `chat.completion.chunk` server-sent events
ending in `data: [DONE]` (a `: working` comment every 10 seconds keeps
connections alive while the bot works). An unknown model answers 404
`model_not_found`; a failed run answers 502 `run_failed`.

## Voice

`GET /api/v1/voice` → `{ transcription: { configured, source, url, model, hasKey } }`:
the service that turns recordings into text, from the settings screen
(`source: "settings"`), `ORBIS_TRANSCRIBE_URL` (`"env"`) or OpenAI with
`OPENAI_API_KEY` (`"openai"`). The key itself is never returned.

`PUT /api/v1/voice/transcription` `{ url?, model?, apiKey? }` saves it (a value
replaces, `null` or `""` clears, a missing field keeps); the key is stored
encrypted with the vault's key. `POST /api/v1/voice/test` sends a second of
silence and answers `{ ok, text, durationMs, error }`.

`POST /api/v1/voice/transcribe?lang=pt-BR` with the recording as the body
(`Content-Type: audio/webm`, `audio/ogg`, `audio/mp4`, `audio/wav`… up to
25 MiB) answers `{ "text": "…" }`. The hub forwards it to
`<url>/audio/transcriptions` as OpenAI's API expects; 503
`transcription_unavailable` without a service, 502 `transcription_failed`
when the service fails.

```bash
curl -s -H "Authorization: Bearer $TOKEN" -H "Content-Type: audio/webm" \
  --data-binary @note.webm "http://127.0.0.1:7420/api/v1/voice/transcribe?lang=en-US"
```

## Runtimes

`GET /api/v1/runtimes/health` → `[{ kind, executable, found, path, version }]`
for `claude-code`, `codex`, `gemini-cli` and `cursor`.

`GET /api/v1/runtimes/local` → `[{ kind, baseUrl, reachable, models, error }]`
for the `ollama` and `lmstudio` servers (`GET <baseUrl>/models`).

`POST /api/v1/runtimes/test` with `{ "botId": "ana" }` (that bot's brain and
secrets) or `{ "brain": { "kind": "ollama", "model": "llama3.2" } }` asks the
brain `What is 17 × 23? Answer with the number only.` with no tools and
answers `{ kind, ok, reply, error, durationMs, answered }`; `answered` is true
when the reply holds 391. A second test of the same bot or brain kind while
one runs answers 409 `test_running`.
