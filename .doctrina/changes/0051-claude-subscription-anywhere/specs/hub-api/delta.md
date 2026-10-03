# Spec Delta — capability: hub-api

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/hub-api/spec.md`

---

```ops
bump-version minor
set-header Realizes: SC7, SC13
append-requirement ubiquitous: The system shall ship a container image of the hub (`Dockerfile`) that listens on every address at port 7420, keeps its data and Claude Code's sign-in on the `/data` volume and runs as an unprivileged user, a compose file (`deploy/docker-compose.yml`) that publishes that port on the machine's own address only and may add a Cloudflare tunnel, and a GitHub Codespaces dev container that builds and starts the hub with its data outside the repository folder.
append-requirement unwanted: The image, the compose file, its example environment and the dev container shall not hold a token, a key or an address of the user's, and shall not set `ANTHROPIC_API_KEY` or `ANTHROPIC_AUTH_TOKEN`.
append-criterion [verified] The image serves on 0.0.0.0:7420 as the node user with /data and Claude Code's folder on the volume; compose publishes on 127.0.0.1 with the tunnels as profiles; the example environment leaves every secret empty and git ignores the real one; the dev container forwards 7420, keeps its data outside the repository and asks for ORBIS_TOKEN and CLAUDE_CODE_OAUTH_TOKEN as Codespaces secrets — verified by `packages/hub/test/cloud-kit.test.ts`.
```
