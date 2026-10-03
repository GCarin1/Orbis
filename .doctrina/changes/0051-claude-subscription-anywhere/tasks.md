# Tasks — Change 0051-claude-subscription-anywhere

<!--
Each task is a single checkable item. Keep tasks small (under a few hours
of work). The change is done when every box is checked and
`doctrina close 0051-claude-subscription-anywhere` succeeds — the close applies the deltas,
archives the change and updates the index, so those are not boxes here.
-->

- [x] Hub: the Claude subscription token (clean, save encrypted, status, server fallback, masking) and its routes.
- [x] Hub: Claude Code runs, the brain test and the account check get the token; never ANTHROPIC_API_KEY/AUTH_TOKEN; other brains and host commands never get it.
- [x] Web: the subscription token on Claude Code's card; the cloud pointer in Settings → Phone.
- [x] Cloud kit: Dockerfile, compose with tunnels, Codespaces dev container; built and run in Docker.
- [x] SC13, ADR 0017, spec deltas, contracts, docs, tests.
