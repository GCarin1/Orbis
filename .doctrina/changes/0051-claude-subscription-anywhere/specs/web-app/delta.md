# Spec Delta — capability: web-app

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/web-app/spec.md`

---

```ops
bump-version minor
append-requirement event: When the user opens Claude Code's card in Settings → Brains, the system shall show whether a subscription token is saved, since when and until about when, or set on the server, say how to get one with `claude setup-token`, and let the user save it in a masked field, replace it or remove it, showing the hub's reason when it is refused.
append-requirement event: When a test of Claude Code fails because its saved subscription token was refused, the system shall say to make a new token with `claude setup-token` and replace it.
append-requirement event: When the user opens Settings → Phone, the system shall point to running Orbis in the cloud with the Claude subscription token, in `docs/cloud.md`.
append-criterion [verified] Claude Code's card saves the token from a masked field and clears it, shows the hub's refusal of an API key, says since when and until about when the token lasts, replaces and removes it, names a token set on the server, and asks for a new token when a saved one was refused — verified by `packages/web/test/claude-sign-in.test.tsx`.
append-criterion [verified] The phone pairing card points to the cloud guide and the claude setup-token token — verified by `packages/web/test/android.test.tsx`.
```
