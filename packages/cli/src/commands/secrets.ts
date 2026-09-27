// `orbis secrets list|set|rm @bot [NAME]` (specs/secrets). A value is typed at a
// hidden prompt or piped on stdin, never passed as an argument (shell history).
import { parseArgs } from "node:util";
import type { CommandContext } from "../context.js";
import { UsageError, json, out, paint, type Io } from "../io.js";

const botPath = (bot: string) => `/api/v1/bots/${encodeURIComponent(bot.replace(/^@/, ""))}/secrets`;

/** Read one line from the terminal without echoing it. */
function hiddenLine(io: Io, prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const stdin = io.stdin as NodeJS.ReadStream;
    io.stdout.write(prompt);
    let value = "";
    const raw = typeof stdin.setRawMode === "function";
    if (raw) stdin.setRawMode(true);
    stdin.resume();
    const done = (err?: Error) => {
      stdin.off("data", onData);
      if (raw) stdin.setRawMode(false);
      stdin.pause();
      io.stdout.write("\n");
      if (err) reject(err);
      else resolve(value);
    };
    const onData = (chunk: Buffer) => {
      for (const ch of chunk.toString("utf8")) {
        if (ch === "\r" || ch === "\n") return done();
        if (ch === "\u0003") return done(new UsageError("cancelled"));
        if (ch === "\u007f" || ch === "\b") value = value.slice(0, -1);
        else value += ch;
      }
    };
    stdin.on("data", onData);
  });
}

async function readValue(ctx: CommandContext, name: string): Promise<string> {
  if (ctx.io.interactive) return hiddenLine(ctx.io, `value for ${name} (hidden): `);
  let text = "";
  for await (const chunk of ctx.io.stdin) text += chunk;
  return text.replace(/\r?\n$/, "");
}

export async function secretsCommand(args: string[], ctx: CommandContext): Promise<number> {
  const [sub, ...rest] = args;
  const client = ctx.client();
  const c = paint(ctx.io);
  const { positionals } = parseArgs({ args: rest, allowPositionals: true, strict: true });
  const [bot, name] = positionals;
  if (!bot) throw new UsageError(`secrets ${sub ?? "list"} needs a bot: orbis secrets ${sub ?? "list"} @ana${sub === "set" || sub === "rm" ? " NAME" : ""}`);
  switch (sub) {
    case undefined:
    case "list":
    case "ls": {
      const secrets = await client.get<Array<{ name: string; createdAt: string }>>(botPath(bot));
      if (ctx.json) return json(ctx.io, secrets), 0;
      if (secrets.length === 0) out(ctx.io, `No secrets for ${bot}.`);
      for (const s of secrets) out(ctx.io, `${c.bold(s.name)}  ${c.dim(`set ${s.createdAt.slice(0, 16).replace("T", " ")}`)}  use {{secret:${s.name}}}`);
      return 0;
    }
    case "set": {
      if (!name) throw new UsageError("secrets set needs a name: orbis secrets set @ana GITHUB_TOKEN (the value is read from a hidden prompt or stdin)");
      const value = await readValue(ctx, name);
      if (!value) throw new UsageError("no value given");
      await client.request("PUT", `${botPath(bot)}/${encodeURIComponent(name)}`, { value });
      out(ctx.io, `Stored ${name} for ${bot}. Bots use it as {{secret:${name}}}; the value never reaches them.`);
      return 0;
    }
    case "rm":
    case "remove": {
      if (!name) throw new UsageError("secrets rm needs a name");
      await client.delete(`${botPath(bot)}/${encodeURIComponent(name)}`);
      out(ctx.io, `Removed ${name}.`);
      return 0;
    }
    default:
      throw new UsageError(`unknown secrets subcommand "${sub}" (list, set, rm)`);
  }
}
