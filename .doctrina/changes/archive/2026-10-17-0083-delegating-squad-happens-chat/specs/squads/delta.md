# Spec Delta — capability: squads

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/squads/spec.md`

---

```ops
bump-version minor
set-header Last updated: 2026-10-17
append-requirement event: When a bot hands work with team.handoff to a squad's @handle or to a bot of a squad that is not in the conversation the bot works in, the system shall post the sender's message in the squad's chat, run the receiver there with the task (its squad's parts handed there too), keep the handoff card in the sender's conversation with the squad named and a link to its chat, and bring the receiver's final answer back there.
append-requirement event: When a bot's reply names with @ a bot of a squad that is not in the conversation, the system shall hand the reply to that bot in its squad's chat, as work whose answer comes back, instead of calling it into the conversation.
append-requirement ubiquitous: The system shall tell a squad's manager to give a squad its work in the squad's own chat (team.handoff to its @handle) and a representative that its squad's work comes to it in its squad's chat.
append-requirement unwanted: The system shall not bring a squad's bot into another conversation to work on a handoff, unless it is already a member of that conversation.
append-criterion [verified] A manager's handoff to @growth posts its message in Growth's chat; the representative works there, hands a part to its squadmate there, and its report — not its words while it waited — closes the manager's card and reaches the manager's report; the squad's bots never speak in the manager's conversation. A reply naming @bia goes to Bia in the squad's chat. A group Bia is in keeps her work there. The manager and the representative are told how — verified by `packages/hub/test/squad-delegation.test.ts`
append-criterion [verified] A handoff card names the squad that works on it and opens its chat — verified by `packages/web/test/collab.test.tsx`
```
