# Tasks — Change 0019-chatgpt-through-codex

- [x] Check how the Codex CLI signs in (OpenAI's docs and the real CLI: `codex login`, `--device-auth`, `login status`, what each prints).
- [x] Add the hub's Codex account: status, install with npm, browser and device sign-in with the link and code parsed from Codex's output, cancel, sign-out; routes under `/api/v1/runtimes/codex/`.
- [x] Add the ChatGPT card to Settings → Brains and label the `codex` brain as the ChatGPT account.
- [x] Cover it with hub, web and end-to-end tests using fake `npm` and `codex`.
- [x] Update the docs (brains guide, API), the contract and the CHANGELOG.
