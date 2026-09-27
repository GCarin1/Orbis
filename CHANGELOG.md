# Changelog

All notable changes to Orbis are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/). Each entry names the Doctrina
change that delivered it.

## [Unreleased]

### Added

- Walking skeleton (change 0001-walking-skeleton):
  - Hub with SQLite storage, REST API under `/api/v1`, WebSocket stream,
    OpenAPI document, bearer-token auth and the web app served at `/`.
  - Bots with handle, role, durable description, avatar, brain, policy,
    computer configuration, skills allowlist and spend cap; pin, hide,
    duplicate and delete with full cascade and workspace destruction.
  - Direct conversations with one timeline, thread replies, reactions and a
    FIFO run queue per bot and conversation; bot states with live events.
  - Brains: `mock`, `claude-code` (headless Claude Code on your subscription,
    with session resume) and `custom-cli`; scrubbed environment for every
    CLI brain.
  - Context assembly within the contract budgets (30 items, 12,000
    characters, 8 relevant memories plus every preference).
  - `orbis` CLI: `serve`, `open`, `login`, `bots`, `chat`.
  - Web app: roster with state rings and labels, timeline with collapsible
    run steps, composer, bot creation, pt-BR and English, installable PWA.
