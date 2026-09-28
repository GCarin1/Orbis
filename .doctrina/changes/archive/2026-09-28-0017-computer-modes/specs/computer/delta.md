# Spec Delta — capability: computer

**Operation:** MODIFIED
**Target spec on apply:** `.doctrina/specs/computer/spec.md`

---

```ops
set-header Implementation: verified — local, host and docker providers (`packages/hub/src/computer/`), browser tools on Playwright (a visible window for host), hibernation, takeover, the live view, the computers setup with the one-click desktop image build, and the `orbis/desktop` image (`docker/desktop/`)
bump-version minor
replace-requirement ubiquitous 2: The system shall provide computers through the provider named in the bot's computer configuration or, when it names none, in ORBIS_COMPUTER_PROVIDER: `local` (a folder of the bot's own on the hub's machine), `host` (the user's own machine, in a folder they choose) or `docker` (a container with a desktop).
append-requirement ubiquitous: The system shall run a `host` computer's commands in the folder named in the bot's `hostDir` (default the user's home directory) with the user's environment except the hub's variables (`ORBIS_*`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`), confine its file tools to that folder, and open its browser as a visible window — the installed Chrome or Edge when there is one — on a profile of the bot's own.
append-requirement ubiquitous: The system shall tell a bot in every run which kind of computer it has and where it works, and that a `host` folder holds the user's real files.
append-requirement ubiquitous: The system shall report, at `GET /api/v1/computers`, what each kind of computer needs on the hub's machine — whether Docker is installed and running, and whether the desktop image exists — and build the desktop image from `docker/desktop/` on request.
append-requirement event: When a bot on a `host` computer writes a file and no rule or grant decides, the system shall ask the user first.
append-requirement unwanted: The system shall not accept a `host` folder that is not an absolute path to an existing directory, shall not remove anything of it when the bot is deleted, and shall not carry `host` access in a template, exported or imported.
append-criterion [verified] A host bot's commands run in its folder with the user's variables and without the hub's, file tools read and write there and refuse `..`, writes ask by default, a missing or relative folder is refused, a template carries no host access, the bot is told where it works, deleting it leaves the folder; `GET /computers` reports Docker installed, running or missing and the image, and one call builds it — verified by `packages/hub/test/computer/host.test.ts`.
```
