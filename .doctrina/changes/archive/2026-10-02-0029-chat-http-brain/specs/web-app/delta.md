# Spec Delta — capability: web-app

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/web-app/spec.md`

---

```ops
bump-version minor
append-requirement ubiquitous: The web app shall offer, for the `chat-http` brain in the new-bot screen and the bot's settings, the address, a password field for the Bearer token with its expiry, the model, advanced request settings, and a box that fills them from a pasted cURL command and then clears it.
append-requirement unwanted: The web app shall not put a `chat-http` token in the bot; it shall save it as the bot's secret, keep a saved one when the field is left empty, and never show it back.
append-criterion [verified] A pasted cURL fills the address, token, model, agent and Origin and leaves the screen; saving puts the token in the bot's secret and the rest in the brain; a saved token is kept when the field is empty, with the brain's time and step limits; a new bot hands its token apart from the bot — verified by `packages/web/test/chat-http.test.tsx`.
```
