# Spec — conversations

**Capability:** conversations
**Status:** active
**Implementation:** verified
**Realizes:** SC1, SC4
**Depends on:** bots
**Last updated:** 2026-09-27
**Version:** 0.11.0

## Purpose

Conversations are where people and bots meet: a direct conversation with one
bot, or a group of bots. Each conversation has ONE timeline that mixes
messages, events (routine created, settings changed, bot-to-bot messages) and
cards (approval, draft, handoff, secret request). This capability owns the
timeline, message routing to bots, threads, reactions and the live stream of
timeline changes.

## Requirements (EARS)

### Ubiquitous

- The system shall keep one timeline per conversation holding messages, events and cards in creation order.
- The system shall support direct conversations with exactly one bot and group conversations created with 2 to 6 bots, the upper bound set by ORBIS_MAX_GROUP_SIZE, which keep at least one bot as members are removed.
- The system shall record for each message its author (user, bot or system), text, attachment references, mentioned handles, optional parent message id for a thread reply, reactions and the run that produced it.
- The system shall broadcast every created or changed timeline item over the WebSocket stream as a `timeline.item` event.
- The system shall persist conversations and timelines in the hub database.
- The system shall give every run a chain id: a user message starts one chain that every bot it runs shares, and the handoffs, reports back and mentions that follow from them carry it on.
- The system shall tell each run where it takes place: the bot's own conversation, a colleague's conversation it was brought into, or a group with its title, its other members and whether the bot leads it.
- The system shall write a run's steps to the database at most every 250 ms while it runs and once when it ends, and index the lookups every run makes (items, approvals and routine records by run; runs by conversation and by status).
- The system shall keep for each group a description, a photo (a small `data:` image URL, or none) and a mute switch, changed with its name and lead through the group's update, and shall give the group's bots its description in their context there.
- The system shall keep each file sent in a conversation — by the user, or by a bot that made it — with its name, type, size, author and message, its bytes in the data directory and never in the database, and list a conversation's files newest first.
- The system shall accept files of up to 25 MB and up to 10 files per message, take a name without folders or control characters, and take the file's type from the upload or else from its name.
- The system shall serve a file's content to a request with the hub's token in its header or its address, showing images, audio, video, PDF and plain text in place and sending every other type as a download, always with a sandboxing content security policy and `nosniff`.

### Event-driven

- When the user posts a message in a direct conversation, the system shall start a run for that conversation's bot with the message as input, also when the message mentions other bots, whom that bot brings in.
- When the user posts a message in a group that mentions bots of the team by `@handle` or by role (`@qa` names every bot whose role is QA), the system shall start one run for each mentioned bot, member of the group or not.
- When the user posts a message in a group that contains `@everyone`, the system shall start one run for every member bot.
- When the user posts a message in a group with no mention, the system shall start a run for the group's lead bot only.
- When a bot's reply in a direct or group conversation mentions other bots of the team by `@handle` or by role — one or two, or in a group any number of the group's own members — the system shall start one run, triggered as `mention`, for each of them in that conversation, in the chain of the run that replied, subject to the chain limits and the exceptions of `specs/handoff`.
- When a client asks for the direct conversation of a bot that has none, the system shall create it, so that each bot has at most one direct conversation.
- When a client adds or removes a reaction on a timeline item, the system shall update the item's reactions and broadcast the change.
- When the user asks to try a failed or cancelled run again, the system shall start a new run of the same bot in the same conversation with the same task and skill, recording the run it retries, and point a handoff card at the new run.
- When the user tries a run again, the system shall keep the new run in the old run's chain.
- When a bot joins a group (at its creation or added later), the system shall post a `member.joined` event naming it, with what shows its face, and the group's history shall be in the bot's context when it runs there.
- When a bot leaves a group (removed, or deleted), the system shall post a `member.left` event naming it, with what shows its face and the reason.
- When a bot is deleted, the system shall take it out of every group it is in, pass on the lead, publish each changed group, and delete a group left with no bot.
- When the user clears a conversation, the system shall delete its items, forget its bots' brain sessions of it and the run summaries its runs left, keep the memories a bot saved on purpose, and publish `conversation.cleared`.
- When a group's name, description, photo or lead changes, the system shall post an event saying so (`group.renamed`, `group.described`, `group.photo`, `group.lead`), which the bots' history leaves out.
- When the user searches a conversation, the system shall return its messages that hold the words ignoring case and accents, newest first, and when the user asks for its links, each http(s) address written in its messages once, newest first, with who wrote it.
- When the user sends a message carrying files, the system shall copy them into the workspace of each bot it wakes, under `orbis-files/`, and tell each bot their names, kinds, sizes and paths, with the text of the text files up to 20,000 bytes as untrusted content.
- When a bot calls `files.send` with a file of its workspace, the system shall post it in the run's conversation as a message of that bot with the caption it gave.
- When a bot calls `files.list` or `files.get`, the system shall list the conversation's files or copy the one named (by id or name) into the bot's workspace.
- When a conversation is cleared or deleted, or an upload stays unsent for a day, the system shall delete its files and their bytes.

### State-driven

- While a bot has a run in progress in a conversation, the system shall queue further inputs for that bot in that conversation and start them in arrival order after the current run ends.

### Unwanted-behavior (must-not)

- The system shall not add a bot to a group that already holds ORBIS_MAX_GROUP_SIZE members.
- The system shall not treat `@everyone` in a group as a mention of bots outside the group.
- The system shall not accept a message with empty text and no attachment.
- The system shall not wake any bot for a reply that names more than two bots from outside its conversation (in a group, bots that are not its members), which reads as a list of the team; it shall post a `mention.list` event instead.
- The system shall not start a run for a bot that a `mention` run's reply names, nor wake by mention a bot that already ran in the same chain.
- The system shall not try again a run that is queued, running, waiting or done; it shall answer 409.
- The system shall not try again a routine's or a webhook's run outside its routine, which keeps the routine's rules (a test run is draft-only); it shall answer 409 `routine_run`.
- The system shall not run a bot that left a group and was not added back when a message there mentions it; it shall post a `member.absent` event instead, and shall not clear a conversation while one of its runs is not over.
- The system shall not accept as a group's photo anything but a PNG, JPEG, WebP or GIF image as a `data:` URL, nor change a direct conversation's group info.
- The system shall not accept as an attachment a file of another conversation or one already sent, nor send with `files.send` a file outside the bot's workspace.

## Acceptance criteria

1. [verified] A message in a direct conversation starts exactly one run of that conversation's bot, and the bot's reply is appended to the same timeline — verified by `packages/hub/test/conversations.test.ts`.
2. [verified] In a group, a message mentioning one member runs only that member, `@everyone` runs every member, and a message with no mention runs only the lead — verified by `packages/hub/test/conversations.test.ts`.
3. [verified] Adding a seventh member to a group with the default limit answers 409 — verified by `packages/hub/test/conversations.test.ts`.
4. [verified] A thread reply stores its parent id, and a reaction change is broadcast as a `timeline.item` event — verified by `packages/hub/test/conversations.test.ts`.
5. [verified] Two messages sent while a run is in progress start two further runs in arrival order — verified by `packages/hub/test/runs.test.ts`.
6. [verified] A bot's reply in a direct conversation that mentions a colleague by role starts that colleague's run in the same conversation, and a user message in a group that mentions a role runs the bot holding it even outside the group — verified by `packages/hub/test/team.test.ts`.
7. [verified] A reply in a direct conversation listing three colleagues wakes none and posts `mention.list`; a group's lead calling three of its members wakes each once as `mention`; a reply calling one colleague wakes it once, and its answer naming the lead back wakes no one; `@everyone` runs each member once — verified by `packages/hub/test/bot-behaviour.test.ts`
8. [verified] Two bots one user message mentions, whose replies mention each other, run once each, in one chain — verified by `packages/hub/test/handoff.test.ts`.
9. [verified] A group run is told the group's title, the other members and that the bot leads it, and a direct run that it is the bot's own conversation; a run that failed for a missing key is tried again after the brain is fixed and replies, and trying a done run again answers 409 — verified by `packages/hub/test/chat-audit.test.ts`.
10. [verified] A run of 40 tool calls stores all its steps with fewer writes than a quarter of them; the database holds the run, conversation and status indexes; a retried run keeps its chain and its reply does not wake again a bot that already answered — verified by `packages/hub/test/audit-cycle5.test.ts`.
11. [verified] Trying again a failed routine test run answers 409 `routine_run` — verified by `packages/hub/test/review.test.ts`.
12. [verified] Creating a group and adding a bot post joined events with the bot's face; a bot added later reads the earlier messages; a removed bot is said to have left and a mention of it does not run it but says so, until it is added back; a group shrinks to one bot and not to none; a deleted bot leaves its groups, said in each, the change is published and a group left with no bot is deleted; clearing deletes the items, the sessions and the run summaries, keeps a saved preference, and is refused while a run works — verified by `packages/hub/test/group-membership.test.ts`.
13. [verified] A group's name, description, photo, lead and mute change and each visible change is said in the group; the same values again and the mute say nothing; a non-image photo and a direct conversation are refused; the description reaches the bots' context and the info events stay out of their history; search ignores case and accents, newest first; links come once each, newest first — verified by `packages/hub/test/group-info.test.ts`.
14. [verified] An uploaded JSON stays the bytes it is; files sent with no text reach the bot's workspace and its task (the text of a small text file as untrusted content), are listed and named in the message; a message of files alone shows them in the list of chats; another conversation's file, one already sent, an empty one and one over 25 MB are refused; images show in place, a page is downloaded and never runs, the token works in the address only for a file's content; a bot sends a file of its workspace with its caption, is refused one outside it or missing, lists the files and copies one back; a day-old unsent upload and a cleared conversation's files are deleted — verified by `packages/hub/test/files.test.ts`

## Maturity

**MVP (committed):**

- Direct and group conversations, routing by mention, threads, reactions, one timeline, live stream.

**Future (aspirational, not committed):**

- Voice memos, dictation and live voice chat.
- Full-text search across all timelines.
- Image understanding for attachments on brains that support it.

## Out of scope for this spec

- The content of cards (see `specs/approvals`, `specs/handoff`, `specs/secrets`, `specs/routines`).
