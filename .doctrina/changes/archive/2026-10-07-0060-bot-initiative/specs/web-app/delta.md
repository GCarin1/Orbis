# Spec Delta — capability: web-app

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/web-app/spec.md`

---

<!-- delta body below -->
```ops
bump-version minor
append-requirement ubiquitous: The web app shall show in a bot's settings its initiative switch, how often it writes, whether it answers its MCP servers' updates and a "Try it now" button; in Settings → Initiative the switch for every bot and the quiet hours, saved with the device's timezone; and above a message a bot wrote on its own, that it did.
append-criterion [verified] A bot's initiative is off until ticked, how often waits until then, both and the MCP choice go with Save, Try it now gives the bot its chance; Settings → Initiative saves every bot's switch and the quiet hours with the device's timezone; a message of initiative says so — verified by `packages/web/test/initiative.test.tsx`
```
