# A bot's initiative

A bot with initiative writes to you on its own, as a colleague would. It
does not wait for you to ask:

- it **asks for a task** that fits its role when it has been idle for a while;
- it **shares an insight** or an idea from what it knows of your work;
- it **reminds** you of something pending;
- it **alerts** you to something it noticed, including what its MCP servers
  announce (see [Updates from a server](mcp.md#updates-from-a-server)).

It writes only when it has something worth saying. When it has nothing, it
answers `[silent]`, and nothing is posted.

## Turning it on

Initiative starts **off** for every bot. To turn it on, open the bot's ⋮ menu →
**Bot settings** → **Initiative**:

| Option | What it does |
|--------|--------------|
| *{name} may write to me on its own* | Turns the bot's initiative on or off. |
| *How often* | **Rarely**: up to once a day, after 12 h idle. **Sometimes**: up to twice a day, after 4 h idle. **Often**: up to 4 times a day, after 2 h idle. |
| *Tell me about its MCP servers' updates* | The bot also writes when one of its MCP servers announces something. |
| **Try it now** | Gives the bot its chance at once, to see what it would say. |

Press **Save** to keep the options. A message the bot wrote on its own shows
**💡 On its own initiative** above it, and a notification arrives as for any
reply.

## For every bot: Settings → Initiative

- **Bots may write to me on their own** pauses every bot's initiative at
  once, whatever each bot's own switch says.
- **Quiet hours** (22:00 to 08:00 to start with): no bot writes on its own in
  these hours, in your device's timezone. Set both times equal for no quiet
  hours.

## Rules a bot keeps

- It never writes while it is working, nor in the quiet hours.
- It does not write again before you answer its last message.
- It writes at most the times a day its rhythm allows. A message of
  `[silent]` does not count.
- It writes "now and then": the hub checks every 10 minutes and gives the
  bot a chance at random, so the message does not come at a fixed time.
- A message of its own may use its tools to check something first. Tools
  that change things still ask you first, as always.
- A failure (a brain not set up, a spend cap reached) is not said in the
  conversation.

Each message uses the bot's brain: on a subscription (Claude Code, Codex)
it counts toward your plan's use, and on an API it costs tokens. *Rarely*
keeps it cheap.
