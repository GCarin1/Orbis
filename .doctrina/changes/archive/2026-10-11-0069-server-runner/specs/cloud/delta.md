# Spec Delta — capability: cloud

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/cloud/spec.md`

---

<!-- delta body below -->

```ops
set-header Last updated: 2026-10-11
bump-version minor
append-requirement event: When the user runs `orbis-server install` on an always-on Linux server, the system shall install Docker when missing, check Orbis out, keep the cloud's address and the Claude plan's token in a `deploy/.env` readable only by its owner, and start the hub; `orbis-server link` shall make it a device of the account connected to that cloud, and `import` shall bring a `.orbis` file into it and remove the copy after (ADR 0025).
append-requirement event: When the cloud closes a hub's relay because another hub of the same account connected, the hub shall give way for good, say so, and try again only once it is unlinked and linked again, given another cloud, or restarted.
append-criterion [verified] A hub replaced by another of its account says so and does not come back, however long, until it is linked again — verified by `packages/hub/test/relay.test.ts`
append-criterion [verified] `orbis-server.sh` installs Docker when missing, clones Orbis, writes `deploy/.env` with the cloud's address readable only by its owner, starts the hub, links it with the cloud from that file, imports a `.orbis` file and removes it after, lists its commands and says when Orbis is not installed — verified by `packages/hub/test/server-script.test.ts`
```
