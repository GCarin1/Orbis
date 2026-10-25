# Spec Delta — capability: web-app

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/web-app/spec.md`

---

```ops
bump-version minor
append-requirement ubiquitous: The web app shall group the settings in Bots (brains, computers, initiative), Conversations (how they talk, voice and appearance), Account and devices (account, phone, health) and Data, and show under Brains the bots and their brains first, the brains ready next, and the rest under Add a brain.
append-criterion [verified] A brain not installed waits under Add a brain, marked Not installed, and a ready one stays out of it — verified by `packages/web/test/brains.test.tsx`
```
