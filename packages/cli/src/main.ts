// The `orbis` command dispatcher. Exit codes: 0 success, 1 failure, 2 usage error.
import { HubClient, ApiError } from "./client.js";
import { resolveConnection, type Connection } from "./config.js";
import type { CommandContext } from "./context.js";
import { UsageError, err, out, type Io } from "./io.js";
import { botsCommand } from "./commands/bots.js";
import { chatCommand } from "./commands/chat.js";
import { serveCommand } from "./commands/serve.js";
import { loginCommand, openCommand } from "./commands/login.js";
import { approvalsCommand } from "./commands/approvals.js";
import { mcpCommand } from "./commands/mcp.js";
import { runtimesCommand } from "./commands/runtimes.js";
import { groupCommand } from "./commands/group.js";
import { memoryCommand } from "./commands/memory.js";

export const HELP = `orbis — persistent AI bots with their own computer, memory and approvals

Usage: orbis <command> [options]

  serve [--port N] [--host H] [--data-dir D]   run the hub (API, stream, web app)
  open                                         open the web app in your browser
  login [--url U] [--token T] [--show-token]   save or show how to reach the hub
  bots list|create|show|edit|delete|duplicate  manage bots
  chat @bot [message]                          talk to a bot (interactive without a message)
  group list|create|chat|add|remove|delete     group conversations of 2 to 6 bots
  memory list|add|edit|rm (@bot | --team)      what a bot or the whole team remembers
  approvals [list|allow <id> [--always]|deny <id> [--note N]]   answer what bots wait for
  runtimes check                               which subscription CLIs (claude, codex, gemini) are installed
  mcp                                          stdio MCP bridge to the hub (needs ORBIS_RUN_TOKEN)

Global options:
  --url <url>      hub URL (else ORBIS_URL, ~/.config/orbis/config.json, http://127.0.0.1:7420)
  --token <token>  API token (else ORBIS_TOKEN, the config file, ~/.orbis/token)
  --json           machine-readable output
  -h, --help       this help
`;

type Command = (args: string[], ctx: CommandContext) => Promise<number>;

const COMMANDS: Record<string, Command> = {
  serve: serveCommand,
  open: openCommand,
  login: loginCommand,
  bots: botsCommand,
  bot: botsCommand,
  chat: chatCommand,
  group: groupCommand,
  groups: groupCommand,
  memory: memoryCommand,
  approvals: approvalsCommand,
  approval: approvalsCommand,
  mcp: mcpCommand,
  runtimes: runtimesCommand,
};

export function registerCommand(name: string, command: Command): void {
  COMMANDS[name] = command;
}

/** Pull the global flags out of argv wherever they appear. */
function splitGlobals(argv: string[]): { rest: string[]; url?: string; token?: string; json: boolean; help: boolean } {
  const rest: string[] = [];
  let url: string | undefined;
  let token: string | undefined;
  let json = false;
  let help = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--json") json = true;
    else if (a === "-h" || a === "--help") help = true;
    else if (a === "--url") url = argv[++i];
    else if (a.startsWith("--url=")) url = a.slice(6);
    else if (a === "--token") token = argv[++i];
    else if (a.startsWith("--token=")) token = a.slice(8);
    else rest.push(a);
  }
  return { rest, url, token, json, help };
}

export async function main(argv: string[], io: Io): Promise<number> {
  const g = splitGlobals(argv);
  const [name, ...args] = g.rest;
  if (!name || g.help) {
    out(io, HELP);
    return name || g.help ? 0 : 2;
  }
  const command = COMMANDS[name];
  if (!command) {
    err(io, `orbis: unknown command "${name}"\n\n${HELP}`);
    return 2;
  }
  let conn: Connection | null = null;
  const connection = () => (conn ??= resolveConnection({ url: g.url, token: g.token }, io.env));
  // `login --url/--token` saves credentials, so it must not treat them as the connection.
  const ctx: CommandContext = {
    io,
    json: g.json,
    connection,
    client: () => new HubClient(connection()),
  };
  if (name === "login") {
    if (g.url) args.push("--url", g.url);
    if (g.token) args.push("--token", g.token);
  }
  try {
    return await command(args, ctx);
  } catch (e) {
    if (e instanceof UsageError || (e instanceof TypeError && "code" in e && String(e.code).startsWith("ERR_PARSE_ARGS"))) {
      err(io, `orbis ${name}: ${e.message}`);
      return 2;
    }
    if (e instanceof ApiError) {
      err(io, `orbis ${name}: ${e.describe()}`);
      return 1;
    }
    err(io, `orbis ${name}: ${e instanceof Error ? e.message : String(e)}`);
    return 1;
  }
}
