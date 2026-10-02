# Design — Change 0022-chat-and-bot-deep-audit

## Approach

One owner per concern. The run engine's clock is the only thing that ends a
run for time, for every brain kind: CLI adapters no longer arm a wall-clock
timer of their own, because that timer cannot know a run is waiting for the
user. Everything between a CLI brain and the hub that also gives up on
a long wait — the bridge's HTTP client, Codex's and the Gemini CLI's MCP tool
timeouts — is opened up to match, so an approval can take as long as the user
needs.

Context carries the whole recent history plus `since`, the end of the bot's
last run in the conversation; each CLI adapter picks what to send by whether
it actually resumed a session, so a session that turns out to be gone gets
the whole conversation instead of the tail.

Memory summaries record the bot's own work only, once, bounded per bot, and
weigh less in the context than facts; migration 7 removes what the 0021 loop
stored, since those summaries pulled bots back into listing the team.

The chat renders Markdown with a small parser to React elements (no HTML, no
dependency), and groups a bot's runs into one bubble with the controls the
API already offered but the UI did not (cancel) or now offers (retry).

## Alternatives considered

- **Keep the process timer, extend it on approvals.** Each adapter would need
  to know about waiting; the engine already does.
- **A Markdown library (marked, markdown-it) with sanitizing.** Renders HTML
  that must then be sanitized; the subset bots write is small, and React
  elements cannot inject markup.
- **Delete all summaries.** Loses the episodic memory that works; removing
  only the loop's mention and report summaries and duplicates keeps it.

## Trade-offs and risks

- A CLI process stuck without asking anything still stops at the time limit;
  one stuck while a request to the user is open stops only when the run is
  cancelled — the stop button is now in the chat.
- The Markdown subset misses nested lists deeper than indentation and HTML
  blocks, which show as text.
- Retrying a run starts a new chain, outside the original budget.

## Decisions to record as ADRs

None: the run clock as the only time limit follows the 0021 change; the rest
are fixes within existing decisions.
