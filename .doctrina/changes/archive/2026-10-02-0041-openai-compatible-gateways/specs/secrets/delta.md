# Spec Delta — capability: secrets

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/secrets/spec.md`

---

```ops
bump-version minor
append-requirement event: When the hub starts and a bot's `apiKeySecret` holds a value that is not a secret's name, the system shall store that value in the bot's vault as `API_KEY`, point the bot's `apiKeySecret` at `API_KEY`, and mask the value in the run errors and timeline items that quote it.
append-requirement unwanted: The system shall not accept a bot whose `apiKeySecret` is not a secret's name (1 to 64 characters of A-Z, 0-9 and _, starting with a letter).
append-criterion [verified] A key pasted where its secret's name goes is refused by the API, and one already stored there is moved into the vault once, the bot pointed at `API_KEY`, the error that quoted it masked and the bot no longer holding it — verified by `packages/hub/test/runtimes/openai.test.ts`.
```
