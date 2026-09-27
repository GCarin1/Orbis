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
orbis group list
orbis group create "<title>" @a @b [...] [--lead @a]      # 2 to 6 bots
orbis group chat <group> [message]                         # group by title or id
orbis group add|remove <group> @bot
orbis group delete <group>
orbis memory list (@bot | --team) [--kind K]
orbis memory add (@bot | --team) <text> [--kind preference|role|fact]
orbis memory edit <id> [text] [--kind K]
orbis memory rm <id> [...]
orbis approvals [list [--all]]
orbis approvals allow <id> [--always]
orbis approvals deny <id> [--note TEXT]
orbis runtimes check            # claude / codex / gemini installed? which version?
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

## Groups and memory

- `orbis group chat Release "@ana check the logs"` runs the mentioned member;
  `@everyone` runs all of them; no mention runs the lead. The CLI keeps
  streaming until every run the message started has ended — including the
  runs bots start by handing work to each other or mentioning each other
  (a handoff shows as `⇢ @ana → @bob: <task>`). `orbis chat` does the same
  for handoffs in a direct conversation.
- `orbis memory list @ana` shows what Ana remembers (preferences, role, facts
  and run summaries); `--team` shows what every bot shares.

## Exit codes

`0` success · `1` the operation failed (hub error, failed run) · `2` usage error.
