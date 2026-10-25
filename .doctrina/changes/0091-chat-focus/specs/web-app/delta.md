# Spec Delta — capability: web-app

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/web-app/spec.md`

---

```ops
bump-version minor
append-requirement ubiquitous: The web app shall keep a conversation's screen to the conversation: the bot's panel closed until opened (team, routines, the computer as one line unless it runs, the brain), the header with the name, the role and the state only while the bot works, each message's listen button and steps on one line under it ("1 step", "N steps"), and one + in the message box for attaching, mentioning and reading replies aloud.
append-criterion [verified] The panel lists the team before the routines and a stopped computer as one line; read aloud is a switch under the message box's +; steps read "3 steps" — verified by `packages/web/test/look.test.tsx`, `packages/web/test/voice.test.tsx`, `packages/web/test/i18n.test.tsx`
```
