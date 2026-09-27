# Tools, approvals and drafts

Capabilities belong to the account; context belongs to the bot. Every bot
reaches the same tool registry — API brains in-process, CLI brains over MCP —
and every call goes through the same deterministic policy.

## Tools

| Tool | Risk | Default | What it does |
|------|------|---------|--------------|
| `team.list_bots` | read | allow | the team's bots with handle, role and state |
| `conversation.post` | write | allow | post a message (a progress update) in a conversation the bot belongs to |
| `draft.create` | external | allow | prepare an email, chat message, social post or webhook call — **never sent** until you press Send |
| `http.fetch` | external | allow | GET or HEAD a URL; the content comes back wrapped in `<untrusted-content>` |

More tools arrive with their capabilities (handoff, memory, computer, browser,
skills, routines, secrets); `computer.shell` and `routine.create` ask by
default. Results longer than 20,000 characters are cut with a marker.

### Per-bot allowlist

`tools` on the bot lists the tools it is offered (globs allowed); the default
`["*"]` offers everything:

```bash
orbis bots edit @ana --tools "team.*,http.fetch,draft.create"
# or: PATCH /api/v1/bots/ana {"tools": ["team.*", "http.fetch", "draft.create"]}
```

A tool outside the allowlist is neither listed nor executable.

## Policy

Each bot has `policy: { rules: [{ tool, decision: allow|ask|deny, locked? }], grants: [] }`.
For each call the first match wins, in this fixed order:

1. locked `deny` rules
2. locked `ask` rules
3. "allow always" grants
4. the other `deny` rules, then `ask`, then `allow`
5. the tool's default

A locked rule cannot be overridden by a grant, by the bot's description or by
anything a model says. Example — "never send anything without asking, and
never touch production":

```json
{
  "rules": [
    { "tool": "draft.*", "decision": "ask", "locked": true },
    { "tool": "http.fetch", "decision": "deny", "locked": true }
  ],
  "grants": []
}
```

## Approvals

When the decision is `ask`, the run pauses (`waiting`), the bot shows
**Waiting for you**, and an approval card appears in its conversation and in
the approvals inbox of the web app, the CLI and the API:

- **Allow once** — run this call.
- **Always allow** — run it and remember a grant for this bot and tool.
- **Deny** — the bot receives "The user denied …" plus your optional note.

From the terminal, `orbis chat` asks inline (`allow [o]nce, [a]lways, or
[d]eny?`), and `orbis approvals list | allow <id> [--always] | deny <id>
[--note ...]` answers from anywhere. If the run ends first, the approval
expires.

## Drafts

`draft.create` only ever creates a card with editable To, Subject, Message
(and URL for webhooks) and **Send** / **Discard**. On Send:

- `webhook` drafts are POSTed as JSON to their URL;
- `email`, `chat` and `social` drafts are appended to `~/.orbis/outbox.jsonl`
  until the SMTP and Slack connectors exist.

## Claude Code's own tools

A `claude-code` bot also has Claude Code's built-in tools. Orbis starts Claude
Code with `--permission-prompt-tool mcp__orbis__approval_prompt`, so each
permission prompt is decided by the same policy under the Orbis tool with the
same effect: Bash → `computer.shell` (asks by default); Write/Edit/MultiEdit/
NotebookEdit → `computer.write_file`; Read/Glob/Grep/LS → `computer.read_file`;
WebFetch/WebSearch → `http.fetch`.
