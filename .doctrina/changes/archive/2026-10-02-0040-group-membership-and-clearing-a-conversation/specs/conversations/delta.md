# Spec Delta — capability: conversations

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/conversations/spec.md`

---

```ops
bump-version minor
replace-requirement ubiquitous 2: The system shall support direct conversations with exactly one bot and group conversations created with 2 to 6 bots, the upper bound set by ORBIS_MAX_GROUP_SIZE, which keep at least one bot as members are removed.
append-requirement event: When a bot joins a group (at its creation or added later), the system shall post a `member.joined` event naming it, with what shows its face, and the group's history shall be in the bot's context when it runs there.
append-requirement event: When a bot leaves a group (removed, or deleted), the system shall post a `member.left` event naming it, with what shows its face and the reason.
append-requirement event: When a bot is deleted, the system shall take it out of every group it is in, pass on the lead, publish each changed group, and delete a group left with no bot.
append-requirement event: When the user clears a conversation, the system shall delete its items, forget its bots' brain sessions of it and the run summaries its runs left, keep the memories a bot saved on purpose, and publish `conversation.cleared`.
append-requirement unwanted: The system shall not run a bot that left a group and was not added back when a message there mentions it; it shall post a `member.absent` event instead, and shall not clear a conversation while one of its runs is not over.
append-criterion [verified] Creating a group and adding a bot post joined events with the bot's face; a bot added later reads the earlier messages; a removed bot is said to have left and a mention of it does not run it but says so, until it is added back; a group shrinks to one bot and not to none; a deleted bot leaves its groups, said in each, the change is published and a group left with no bot is deleted; clearing deletes the items, the sessions and the run summaries, keeps a saved preference, and is refused while a run works — verified by `packages/hub/test/group-membership.test.ts`.
```
