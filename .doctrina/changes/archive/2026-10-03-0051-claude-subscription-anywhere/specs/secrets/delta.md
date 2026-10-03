# Spec Delta — capability: secrets

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/secrets/spec.md`

---

```ops
bump-version minor
append-requirement ubiquitous: The system shall keep the Claude subscription token as a hub secret encrypted with the vault's key, and mask that token, saved or from the hub's environment, in everything a run stores or shows.
append-criterion [verified] The Claude subscription token is not in the database files, survives a restart, never comes back from the API, and shows as •••• in a run's reply and in the timeline — verified by `packages/hub/test/runtimes/claude-token.test.ts`.
```
