# Spec Delta — capability: bots

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/bots/spec.md`

---

```ops
bump-version minor
replace-requirement ubiquitous 1: The system shall store each bot with an id, a unique handle, a name, a role label, a description that holds its durable rules, an avatar made of a color and a shape (one of `orb`, `blob`, `square`, `pill`, `triangle`, `hexagon`, `cloud`, `drop`) with initials derived from the name, a brain configuration, the bot it reports to (its manager, or none), a tool policy, a tool allowlist, a computer configuration, a skill allowlist and a monthly spend cap in USD.
replace-requirement event 1: When a user duplicates a bot, the system shall create a new bot with the same name suffixed " (copy)", role, description, avatar color and shape, brain, manager, policy, computer configuration and skill allowlist, a new handle, and no memory, conversations, computer state or secrets.
replace-requirement optional 1: Where a new bot has no avatar color or shape, the system may derive the color from a hash of its role label and the shape from a hash of its name.
append-criterion [verified] A bot keeps the avatar shape and color it is given, gets both derived when none is given, refuses an unknown shape with 400, and a duplicate keeps them — verified by `packages/hub/test/bots.test.ts`.
```
