# Spec Delta — capability: hub-api

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/hub-api/spec.md`

---

<!-- delta body below -->

```ops
set-header Last updated: 2026-10-08
bump-version minor
replace-requirement ubiquitous 2: The system shall require, on every REST, stream and OpenAI-compatible request, the hub's token (read from ORBIS_TOKEN or generated at first start into the data directory file `token`) or, once an Orbis account is linked to the hub, a Supabase Auth session of that account, checked against the public keys of the project ORBIS_SUPABASE_URL names (the Orbis project by default; `off` takes no account).
append-requirement event: When a request signed with the hub's token links an account with that account's session, the hub shall open from then on for that account's sessions, and for no other account's; when the account is unlinked, its sessions shall stop opening the hub at once.
append-requirement event: When a signed-in client asks for a stream ticket, the hub shall answer one that opens the event stream once, within 60 seconds; when it asks for a file key, one that opens files' content, and nothing else, for an hour.
append-requirement unwanted: The hub shall not take a credential in an address: the stream opens only with a ticket, a file's content only with a file key or the bearer header, and `?token=` works nowhere.
append-requirement unwanted: The hub shall not take a session signed with `none` or a shared secret, one from another project, for anonymous users, expired or not valid yet beyond 30 seconds of clock skew, nor let a session alone link an account.
append-requirement unwanted: Past 20 refused credentials in a minute from one address, the hub shall answer 429 `too_many_failures` instead of 401, and shall never refuse a valid credential for it.
append-criterion [verified] A session holds only when signed by the project's key, from the project, for a signed-in account, in time, never unsigned nor HS256, and a new key id fetches the keys again; it opens the hub only once the token linked its account, never another account's, a session alone cannot link, and unlinking closes it; 20 refusals a minute make the next wait while the token still passes; with ORBIS_SUPABASE_URL off there is no account — verified by `packages/hub/test/auth.test.ts`
append-criterion [verified] The stream opens only with a ticket, once, never with the token in its address; a file's content opens with the file key or the bearer header, never with `?token=`, and the key opens nothing else — verified by `packages/hub/test/stream.test.ts` and `packages/hub/test/files.test.ts`
```
