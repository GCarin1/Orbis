# Tasks — Change 0041-openai-compatible-gateways

<!--
Each task is a single checkable item. Keep tasks small (under a few hours
of work). The change is done when every box is checked and
`doctrina close 0041-openai-compatible-gateways` succeeds — the close applies the deltas,
archives the change and updates the index, so those are not boxes here.
-->

- [x] Hub: `apiKeyHeader`, the name pattern, `{model}` in the address, the key header, non-streamed answers and the stream fallback, no-echo checks.
- [x] Secrets: move a key pasted in the name field into the vault at start and mask it where it was quoted.
- [x] Web: the API key field and the header choice in bot settings and the new-bot screen; CLI flag.
- [x] Tests: hub gateway, fallback and migration; web key field.
- [x] Docs, CHANGELOG, contract.
