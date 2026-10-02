# Spec Delta — capability: web-app

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/web-app/spec.md`

---

```ops
bump-version minor
append-requirement event: When the user types an API key for an API brain in a bot's settings or on the new-bot screen and saves, the web app shall send it to the bot's vault, set the bot's `apiKeySecret` to that secret's name, empty the field and show that a key is saved, without the key being part of the bot.
append-requirement optional: Where the brain is OpenAI-compatible, the web app shall offer how to send the key (Authorization Bearer or an `api-key` header) and say that `{model}` in the address is replaced by the model.
append-criterion [verified] A typed key goes to `PUT /bots/:id/secrets/API_KEY` and the saved brain holds only the name and the `api-key` choice; a saved key is kept when the field is left empty; a new bot hands its key apart from the bot — verified by `packages/web/test/api-key.test.tsx`.
```
