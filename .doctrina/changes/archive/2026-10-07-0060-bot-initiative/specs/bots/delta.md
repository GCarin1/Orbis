# Spec Delta — capability: bots

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/bots/spec.md`

---

<!-- delta body below -->
```ops
bump-version minor
append-requirement ubiquitous: The system shall keep for each bot its initiative — whether it may write to the user on its own (off until the user turns it on), how often (rarely: at most once a day after 12 hours of quiet; sometimes: twice a day after 4 hours; often: four times a day after 2 hours) and whether it answers its MCP servers' updates — and for every bot a switch and quiet hours in the user's timezone (22:00 to 08:00 until changed).
append-requirement event: When a bot with initiative has been quiet for its rhythm's time, every bot's initiative is on, it is not in the quiet hours, the bot is not working, and its last message on its own was answered by the user, the system shall now and then start a run in the bot's conversation with the user that asks it to write on its own (a task to ask for, an insight, a reminder or an alert, in one to three sentences) or to answer `[silent]`.
append-requirement event: When the user presses "Try it now" for a bot that is not working, the system shall start such a run at once.
append-requirement unwanted: The system shall not post a `[silent]` answer of a run of initiative, nor say its failure in the conversation, nor count either toward the bot's day.
append-requirement unwanted: The system shall not write on a bot's initiative more often than its rhythm allows in 24 hours, nor in the quiet hours, nor while every bot's initiative is off.
append-criterion [verified] A new bot's initiative is off and it never writes on its own; turned on, it writes after its rhythm's quiet and not before, the run says how long it was quiet and offers [silent], the message is posted in its conversation, no other one comes before the user answers and one comes after; a rare bot writes once a day at most and an unlucky roll waits; quiet hours in the user's timezone and every bot's switch hold it back, times and timezones are checked; [silent] posts nothing, a failure says nothing and neither counts; Try it now starts a run at once and is refused while the bot works — verified by `packages/hub/test/initiative.test.ts`
```
