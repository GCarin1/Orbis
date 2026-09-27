# The `orbis` CLI

```
orbis serve [--port N] [--host H] [--data-dir D] [--quiet]
orbis open
orbis login [--url U] [--token T] [--show-token] [--status]
orbis bots list [--all]
orbis bots create --name N [--handle H] [--role R] [--description D] [--spend-cap USD] [--tools a,b.*]
                  [--brain KIND] [--model M] [--command C] [--base-url U] [--api-key-secret NAME]
orbis bots show @bot
orbis bots edit @bot [same options as create] [--pin|--unpin] [--hide|--unhide]
orbis bots duplicate @bot
orbis bots delete @bot --yes
orbis chat @bot [message]
orbis approvals [list [--all]]
orbis approvals allow <id> [--always]
orbis approvals deny <id> [--note TEXT]
orbis mcp                       # stdio MCP bridge; needs ORBIS_RUN_TOKEN
```

Global options: `--url`, `--token`, `--json`, `--help`.

## Where the CLI finds the hub

Each value resolves on its own, first match wins:

1. `--url` / `--token`
2. `ORBIS_URL` / `ORBIS_TOKEN`
3. `~/.config/orbis/config.json` (written by `orbis login`, mode 0600)
4. a hub on this machine: `~/.orbis/token` (or `$ORBIS_DATA_DIR/token`) and
   `http://127.0.0.1:7420`

`orbis login --status` shows what was found and where from. The token is
printed only by `orbis login --show-token`.

## Chatting

- `orbis chat @ana "message"` sends one message, prints the bot's steps as they
  stream (`·` thinking, `→` tool call, `←` tool result) and the reply, and exits
  0 — or 1 when the run failed.
- `orbis chat @ana` on a terminal opens an interactive session (Ctrl+D leaves).
- `echo "message" | orbis chat @ana` sends stdin as one message.
- `--json` prints the bot's reply items as JSON lines.
- When a run waits for your approval, an interactive `orbis chat` asks
  `allow [o]nce, [a]lways, or [d]eny?` (deny asks for an optional note); a
  piped `orbis chat` prints the approval id to answer with `orbis approvals`.

## Exit codes

`0` success · `1` the operation failed (hub error, failed run) · `2` usage error.
