# Spec Delta — capability: conversations

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/conversations/spec.md`

---

```ops
set-header Implementation: verified
bump-version minor
replace-requirement event 1: When the user posts a message in a direct conversation, the system shall start a run for that conversation's bot with the message as input, also when the message mentions other bots, whom that bot brings in.
replace-requirement event 2: When the user posts a message in a group that mentions bots of the team by `@handle` or by role (`@qa` names every bot whose role is QA), the system shall start one run for each mentioned bot, member of the group or not.
replace-requirement event 5: When a bot's reply in a direct or group conversation mentions other bots of the team by `@handle` or by role, the system shall start a run for each of them in that conversation, subject to the chain depth limit and the exceptions of `specs/handoff`.
replace-requirement unwanted 2: The system shall not treat `@everyone` in a group as a mention of bots outside the group.
append-criterion [verified] A bot's reply in a direct conversation that mentions a colleague by role starts that colleague's run in the same conversation, and a user message in a group that mentions a role runs the bot holding it even outside the group — verified by `packages/hub/test/team.test.ts`.
```
