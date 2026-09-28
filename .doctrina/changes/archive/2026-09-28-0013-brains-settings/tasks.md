# Tasks — Change 0013-brains-settings

- [x] Add the `cursor`, `ollama` and `lmstudio` brain kinds and the runtime shapes to `@orbis/shared`.
- [x] Write the Cursor CLI adapter with its MCP wiring and chat resume, and a fake Cursor CLI to test it.
- [x] Turn the OpenAI-compatible adapter into `openai`, `ollama` and `lmstudio`, with the retry without tools.
- [x] Run Windows `.cmd` shims through their Node.js script in the process runner and the health check.
- [x] Add the local servers and the brain test to the hub API, and Cursor to the health check.
- [x] Add `orbis runtimes test` and the local servers to `orbis runtimes check`.
- [x] Build the web settings screen, the new brain options with model suggestions and the header brain badge.
- [x] Cover it with hub, CLI, web and end-to-end tests.
- [x] Update the contracts, `.env.example`, docs, READMEs and CHANGELOG.
