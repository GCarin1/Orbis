# Design — Change 0002-tool-gateway-and-approvals

## Approach

One `ToolGateway` implements the engine's `RunToolHost`. When a run opens,
it issues a run token (32 random bytes, kept in memory, revoked when the run
closes) and returns:

- a `ToolBridge` for API brains and the mock (in-process calls), and
- an `McpWiring` for CLI brains: the stdio server entry
  `node <hub>/dist/mcp-bridge.js` with `ORBIS_URL` and `ORBIS_RUN_TOKEN` in
  its env only, plus the permission tool name for Claude Code.

Both paths end in `ToolGateway.execute(run, bot, name, input)`:

1. allowlist check (`Bot.tools`, glob patterns);
2. input validation against the tool's JSON Schema (TypeBox `Compile`);
3. `ApprovalService.gate()` — `decide()` is a pure function of (policy,
   tool); an `ask` creates the approval row and card, sets the run to
   `waiting` and the bot to `waiting`, and awaits the user's answer or the
   run's abort signal;
4. the handler, errors turned into error results;
5. the result cap (20,000 characters) with a truncation marker.

Steps are not recorded by the gateway: each brain already reports its tool
calls in its own stream (API adapters and the mock yield them, Claude Code's
stream-json carries `mcp__orbis__*` tool uses), so recording here would
duplicate them.

Claude Code's own tools (Bash, Write, WebFetch…) never reach the gateway;
with `--permission-prompt-tool` Claude asks `approval_prompt`, which maps the
built-in tool to the Orbis tool with the same effect and runs the same
policy and approval flow, answering `allow` or `deny` in Claude's format.

## Alternatives considered

- Recording steps in the gateway — duplicates what brains already report.
- The official MCP SDK — four methods are needed; ADR 0004 chose a small
  in-house implementation.
- Letting `http.fetch` POST — would let a bot send data out without a draft;
  outbound data goes through `draft.create` instead.

## Trade-offs and risks

- Run tokens live in memory: a hub restart revokes them, which is correct
  because the runs die with the hub too.
- The permission prompt tool is a hidden Claude Code flag; if it changes, the
  contract and the adapter test move together.

## Decisions to record as ADRs

- None new: ADRs 0004 and 0006 decided this; both are landed at close.
