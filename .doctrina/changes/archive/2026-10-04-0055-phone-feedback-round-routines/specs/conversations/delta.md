# Spec Delta — capability: conversations

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/conversations/spec.md`

---

<!-- delta body below -->
```ops
bump-version minor
replace-requirement event 5: When a bot's reply in a direct or group conversation mentions other bots of the team by `@handle` or by role — one or two, or in a group any number of the group's own members — the system shall start one run, triggered as `mention`, for each of them in that conversation, in the chain of the run that replied, subject to the chain limits and the exceptions of `specs/handoff`.
replace-requirement unwanted 4: The system shall not wake any bot for a reply that names more than two bots from outside its conversation (in a group, bots that are not its members), which reads as a list of the team; it shall post a `mention.list` event instead.
replace-criterion 7: [verified] A reply in a direct conversation listing three colleagues wakes none and posts `mention.list`; a group's lead calling three of its members wakes each once as `mention`; a reply calling one colleague wakes it once, and its answer naming the lead back wakes no one; `@everyone` runs each member once — verified by `packages/hub/test/bot-behaviour.test.ts`
```
