# Bot behaviour audit

Bots are the product: if a team of bots cannot answer a simple question
without looping, nothing else matters. This audit (change
`0021-bot-behaviour-audit`, ADR 0011) started from the project owner's test on
Windows with a team of four bots — a manager (Gte), an analyst (Anl), a
researcher (Pesquisa) and a developer (Dev) — and followed every path a bot
takes: how it is woken, what it is told, which tools it calls, how long it
may run and how it fails. Every finding below is a regression test in
`packages/hub/test/bot-behaviour.test.ts` or
`packages/hub/test/runtimes/windows-shims.test.ts`.

## Findings

| # | What the owner saw | Root cause | Fix |
|---|---|---|---|
| 1 | A simple question in a group: the bots answered each other in a loop, the same text again and again, each answer a new request to their brains | A bot's reply woke **every** bot it `@mentioned`, and only the depth limit (6) stopped it. A manager answering "available now: @anl, @pesquisa and @dev" woke three bots, each of whom listed the team again: about 3⁶ runs | Runs share a **chain** per message. A reply naming more than two bots is a list and wakes no one (`mention.list` event); a bot woken by a mention wakes no one; a bot that already answered the message is not woken again; one chain holds at most `ORBIS_MAX_CHAIN_RUNS` runs (12, `chain.limit` event). Bots are told what `@` does, and `team.list_bots` returns handles without `@` |
| 2 | Playwright MCP: "the server stopped (exit code 1): } Node.js v24.13.1" | On Windows Orbis runs npm `.cmd` shims without cmd.exe by reading the script they launch. Node 24's `npx.cmd` names `npm-prefix.js` before `npx-cli.js`, and Orbis picked the first: node ran the wrong file. The error shown was the last lines of the crash, Node's version banner | The shim reader prefers the `*-cli.js` script and never a `prefix` helper; an MCP server's failure is reported by its error line |
| 3 | "could not start the brain process: …\npm\claude.CMD is a Windows batch file"; Claude Code's version showed "?" | Claude Code 2 installs a native `claude.exe`; its shim launches the exe, not a Node script, and Orbis refused any shim without a script | A shim that points at a program (not `node.exe`) runs that program directly |
| 4 | `browser.open` failed: Playwright's `chromium_headless_shell` not installed | Orbis used only Playwright's own Chromium, downloaded separately with `npx playwright install` | The browser falls back to the Google Chrome or Microsoft Edge installed on the machine, and when neither is there, says what to install |
| 5 | Asked to create a skill, a bot ran `find .claude/skills` and `dir`, waited for approvals, then "timed out after 900s" | (a) The bot did not know it was on Windows, so it ran Linux commands; (b) it had no tool to write a skill; (c) the 15-minute limit counted the minutes spent waiting for the owner's approvals | (a) The context names the OS and the shell (cmd.exe on Windows) and points to the file tools; (b) new tool `skills.create` (asks first); (c) the time limit pauses while a run waits for the user |
| 6 | "ANL: fetch failed" | An LM Studio / Ollama server that is not running fails the HTTP request; the error did not say which address or what to do | "could not reach http://…/v1 (ECONNREFUSED): is the LM Studio server running and the address right?" |
| 7 | "ANL3: openai brain: no API key for https://api.openai.com/v1", many times | A bot set to the OpenAI **API** without a key (a ChatGPT subscription is not an API key), woken again and again by the loop of finding 1 | The loop is gone; the error ends with "open Anl3's settings (⚙) to fix its brain"; the brain is labelled "needs a paid API key" — use **ChatGPT (Codex)** for a subscription |

## Further findings of the audit

- **A model that keeps calling tools.** API brains (OpenAI-compatible, Anthropic,
  Ollama, LM Studio) stopped at their step limit with an error and no answer.
  The last step now sends no tools and asks the model to answer with what it
  found.
- **The same call over and over.** A small model can repeat one search
  forever. The gateway refuses the third call of the same tool with the same
  input in one run and tells the bot to use what it has; tools that read
  changing state (browser snapshot, screenshot, team list) are exempt.
- **Stuck states after a crash.** A bot shown as `working` or `thinking` when
  the hub stopped stayed so after a restart; every bot now starts `idle`.

## What stays as it is

- CLI brains (Claude Code, Codex, Gemini CLI, Cursor) run their own loops and
  step limits; Orbis bounds them with the time limit, the chain limit and the
  identical-call guard on Orbis tools.
- The Windows fixes were tested with the exact shim texts npm, Node 24 and
  Claude Code 2 install, not on a Windows machine.
- Bots have no built-in web search: connect a search server from
  **🧩 Tools** (Exa needs no account) and tick the bots that may use it.

## Second round: the chat and the bots in depth

Change `0022-chat-and-bot-deep-audit` read every path of a run — the queue,
what the bot is told, how each brain starts and stops, how tool calls and
approvals travel, what the bot remembers and how the chat shows it. Every
finding is a regression test in `packages/hub/test/chat-audit.test.ts` or
`packages/web/test/chat-audit.test.tsx`.

| # | Finding | Effect for the user | Fix |
|---|---|---|---|
| 8 | CLI brains (Claude Code, Codex, Gemini, Cursor) had their own 15-minute process clock besides the run's | The first round's "waiting does not count" fix covered API brains only: a Claude Code bot still died mid-approval | Only the run's clock ends a run, for every brain |
| 9 | The MCP bridge sent one call at a time with Node's `fetch`, which gives up on an answer after 5 minutes | An approval answered after 5 minutes failed; other calls waited behind it | Calls go side by side over `node:http`, with no answer time limit |
| 10 | Codex gives up on an MCP tool after 60 s, the Gemini CLI after 10 min | A Codex bot's approved action failed after a minute | 24-hour tool timeout for the Orbis server |
| 11 | A Codex thread that no longer exists (signed out, sessions cleared) failed with "no rollout found" | **Every** later message to that bot in that conversation failed | A new thread starts, with the whole conversation |
| 12 | A new session after a lost one got only the messages since the last run | The bot "forgot" the conversation | The whole recent conversation is sent when a session starts |
| 13 | Prompts went on the command line | A long paste could pass Windows' 32,767-character limit | Prompts over 8,000 characters go on stdin |
| 14 | Every successful run saved a summary memory, the loop's answers too | Old roster answers came back as "memories" and pulled bots into repeating them | No summaries of mention or report answers, no duplicates, 200 per bot, at most 3 in a context; migration 7 removes the loop's |
| 15 | Memory search matched words like "de", "que", "the" | Unrelated summaries ranked as relevant | Common Portuguese and English words are left out |
| 16 | A message longer than 12,000 characters emptied the history | After a long report, the bot saw no conversation at all | Long items are cut to their start and end |
| 17 | Bots did not know the date, where they were or who was there | Wrong dates; answers in English to Portuguese | Today's date and time zone, "answer in the user's language", the group and its members |
| 18 | A bot's state followed its last finished run | A bot busy in another conversation showed "done" | It stays busy while any run is running or waiting |
| 19 | Runs left waiting for an approval by a stopped hub stayed "waiting" | Endless "…" bubbles and a bot stuck "waiting" | They are failed at start, with their handoff cards |
| 20 | Two approvals open in one run: the first answer resumed it | Its clock ran while the second still waited | The run waits until the last answer |
| 21 | OpenAI-compatible servers: no retry; tool calls ignored when the server says `stop`; `<think>` text in replies | Rate limits failed runs; tools silently skipped; reasoning shown as the answer | Two retries; tool calls always run; `<think>` shown as thinking |
| 22 | The chat had no way to stop a bot | During the loop the user could only wait | ■ Stop on each busy bot cancels its run and queue |
| 23 | Replies are Markdown but showed as raw text | `**`, `-` and tables shown literally | Markdown is rendered as elements (never as HTML) |
| 24 | A failed run could only be retyped | After fixing a bot's brain the user had to resend | **Try again** on the failure line |
| 25 | The chat jumped to the bottom on every new item, showed 200 items only, dropped send errors | Lost place while reading; no older messages; a failed send said nothing | Keeps your place with a "new below" button; **Load earlier messages**; the error shows and the text stays |

## Audit cycles

After the deep audit, five cycles of audit and fix, each one a Doctrina
change with its own regression tests (`packages/hub/test/audit-cycleN.test.ts`).

| Cycle | Area read | Findings fixed |
|---|---|---|
| 1 (0023) | Routines, skills, secret requests, spend caps, handoff edge cases | A cron routine faster than its work piled runs up in the queue (now a turn is skipped, with one `routine.skipped` event); a routine run cut by a restart showed as running forever; Codex's older event shape had its cumulative token totals added whole |
| 2 (0024) | The web app's state: stream, cards, approvals inbox, conversation list, reading aloud | A dead connection (after sleep or a Wi-Fi drop) still read "connected" and replies never came (now a ping every 25 s replaces it); a refused approval or draft answer failed silently; the inbox did not say what a call would do and opened the wrong conversation for a group; previews and reading aloud included Markdown marks |
| 3 (0025) | The bot's computer: shell, files, browser | On Windows "não" came back as "n�o" (cmd.exe's code page 850; now UTF-8); npm, git and python failed in the isolated computer without APPDATA, TEMP and USERPROFILE; reading a binary or huge file returned garbage or took the hub down; a missing file answered with the hub's full path; long pages were not readable past 12,000 characters |
| 4 (0026) | External MCP servers, the OpenAI-compatible API, the `orbis` command | A server with a long name gave tools wire names over 64 characters: the model API refused the request and every reply of the bots given it failed (now at most 52); an HTTP server that ended its session failed every call until a manual reconnect; a stopped run waited on a slow MCP call; the OpenAI API crashed on a message that started no run; `orbis chat` followed another message's runs |
| 5 (0027) | A sweep of cycles 0022–0026, performance | Each step of a run rewrote all its steps to the database: a long run wrote hundreds of MB and blocked the hub (now every 250 ms); lookups every run makes scanned whole tables (migration 8 adds indexes); a retried run woke again a bot that had answered; the chat re-parsed every message on each step; the send error stayed after editing |

## Settings

| Variable | Default | Effect |
|---|---|---|
| `ORBIS_MAX_CHAIN_RUNS` | 12 | Most bot runs one message can set off; reports back always run |
| `ORBIS_MAX_HANDOFF_DEPTH` | 6 | Most levels of bots waking bots |
| Bot → Brain → time limit | 15 min | Working time of one run, not counting waits for you |
