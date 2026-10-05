# Tasks — Change 0058-instagram-adelaidasofia

<!--
Each task is a single checkable item. Keep tasks small (under a few hours
of work). The change is done when every box is checked and
`doctrina close 0058-instagram-adelaidasofia` succeeds — the close applies the deltas,
archives the change and updates the index, so those are not boxes here.
-->

- [x] Read adelaidasofia/instagram-mcp (egress pinned to Meta's hosts, token never echoed, audit without content, DMs gated) and check PyPI 0.1.2 against the GitHub code; run it with `pipx` and list its 29 tools.
- [x] Replace the mcpware Instagram entry with adelaidasofia/instagram-mcp (`pipx run --spec adelaidasofia-instagram-mcp==0.1.2`), its token, account ID and optional app secret.
- [x] `readOnlyTools` on a catalog entry: the reads it names run without asking.
- [x] A connection whose entry now runs another program is an error until connected again.
- [x] Install `python3` and `pipx` in the phone's Debian.
- [x] Hub tests, docs (`docs/mcp.md`), CHANGELOG, hub-surface contract.
