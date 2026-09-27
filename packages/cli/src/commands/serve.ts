// `orbis serve` — run the hub in the foreground.
import { parseArgs } from "node:util";
import type { CommandContext } from "../context.js";
import { UsageError, out } from "../io.js";

export async function serveCommand(args: string[], ctx: CommandContext): Promise<number> {
  const { values } = parseArgs({
    args,
    options: {
      port: { type: "string", short: "p" },
      host: { type: "string" },
      "data-dir": { type: "string" },
      quiet: { type: "boolean", short: "q" },
    },
    strict: true,
  });
  const port = values.port !== undefined ? Number(values.port) : undefined;
  if (port !== undefined && (!Number.isInteger(port) || port < 0 || port > 65535)) {
    throw new UsageError("--port must be a port number");
  }
  const { startHub } = await import("@orbis/hub");
  const { hub, url } = await startHub({
    ...(port !== undefined ? { port } : {}),
    ...(values.host ? { host: values.host } : {}),
    ...(values["data-dir"] ? { dataDir: values["data-dir"] } : {}),
    logger: !values.quiet,
  });
  out(ctx.io, `Orbis hub listening on ${url}`);
  out(ctx.io, hub.config.tokenFile ? `API token file: ${hub.config.tokenFile}` : "API token: from ORBIS_TOKEN");
  out(ctx.io, hub.config.webDir ? `Web app: ${url}/  (orbis open)` : "Web app: not built (npm run build)");
  // Keep running until a signal stops the process (startHub installs the handlers).
  await new Promise(() => undefined);
  return 0;
}
