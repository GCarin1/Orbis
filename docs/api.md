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

## Stream

`ws://127.0.0.1:7420/api/v1/stream?token=<token>` — send
`{"type":"subscribe","conversations":["cnv_…"]}` (omit `conversations` for
everything). Events: `bot.state`, `bot.updated`, `bot.deleted`,
`conversation.updated`, `timeline.item`, `run.updated`, `run.step`,
`approval.requested`, `approval.resolved`. Account-wide events (`bot.*`,
`approval.*`) reach every subscriber.
