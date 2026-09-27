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
curl -s -X POST -H "$H" http://127.0.0.1:7420/api/v1/bots/ana/duplicate
curl -s -X DELETE -H "$H" http://127.0.0.1:7420/api/v1/bots/ana   # destroys memory, secrets, computer
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

## Stream

`ws://127.0.0.1:7420/api/v1/stream?token=<token>` — send
`{"type":"subscribe","conversations":["cnv_…"]}` (omit `conversations` for
everything). Events: `bot.state`, `bot.updated`, `bot.deleted`,
`conversation.updated`, `conversation.deleted`, `timeline.item`, `run.updated`, `run.step`,
`approval.requested`, `approval.resolved`, `computer.updated`. Account-wide
events (`bot.*`, `approval.*`, `computer.updated`) reach every subscriber.

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

## Runtimes

`GET /api/v1/runtimes/health` → `[{ kind, executable, found, path, version }]`
for `claude-code`, `codex` and `gemini-cli`.
