# Spec Delta — capability: bots

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/bots/spec.md`

---

```ops
set-header Implementation: verified
bump-version minor
replace-requirement ubiquitous 1: The system shall store each bot with an id, a unique handle, a name, a role label, a description that holds its durable rules, an avatar made of initials and a color, a brain configuration, the bot it reports to (its manager, or none), a tool policy, a tool allowlist, a computer configuration, a skill allowlist and a monthly spend cap in USD.
append-requirement ubiquitous: The system shall place in every prompt of a bot its team: the bot it reports to, the bots that report to it and its other colleagues with their roles, and how to delegate to them and bring them into a conversation.
replace-requirement event 1: When a user duplicates a bot, the system shall create a new bot with the same name suffixed " (copy)", role, description, avatar color, brain, manager, policy, computer configuration and skill allowlist, a new handle, and no memory, conversations, computer state or secrets.
append-requirement event: When a user deletes a bot that other bots report to, the system shall make them report to the deleted bot's own manager, or to no one.
append-requirement unwanted: The system shall not let a bot report to itself, to a bot that does not exist, or to a bot that already reports to it directly or through others.
append-criterion [verified] A bot records the manager it reports to; reporting to itself, to a bot that reports to it or to an unknown bot answers 400; a duplicate keeps the manager; deleting a manager moves its reports to its own manager; each bot's prompt names its manager, its reports and its colleagues — verified by `packages/hub/test/team.test.ts`.
```
