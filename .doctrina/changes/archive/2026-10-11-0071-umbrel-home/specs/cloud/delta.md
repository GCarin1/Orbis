# Spec Delta — capability: cloud

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/cloud/spec.md`

---

<!-- delta body below -->

```ops
set-header Last updated: 2026-10-11
bump-version minor
append-requirement event: When a person's Orbis is deployed on a home server from `deploy/umbrel/docker-compose.yml`, the system shall run their own hub with its own data volume and memory ceiling, publish no port, and reach it only through the stack's own Tailscale node, which serves `https://orbis-<name>.<tailnet>.ts.net` to the hub over the stack's private network and never through Funnel; a stack without its name, tailnet or auth key shall not start (ADR 0027).
append-requirement ubiquitous: The system shall publish its server image, ready for amd64 and arm64, so a home server compiles nothing.
append-criterion [verified] A person's stack publishes no port, serves HTTPS on 443 of its own Tailscale node to `http://orbis:7420` and never Funnel, writes the serve file before Tailscale's own start, gives the hub the published image, its own data and node volumes, its address and a memory ceiling, restarts on its own, writes no key in the file and refuses to start without its name, tailnet or auth key; the image is published for amd64 and arm64 — verified by `packages/hub/test/cloud-kit.test.ts`
```
