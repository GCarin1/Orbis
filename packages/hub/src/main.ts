#!/usr/bin/env node
// Start a hub from the environment. `orbis serve` calls startHub().
import { pathToFileURL } from "node:url";
import { createHub, type Hub } from "./server.js";

export interface StartedHub {
  hub: Hub;
  url: string;
}

export async function startHub(options: { port?: number; host?: string; dataDir?: string; logger?: boolean } = {}): Promise<StartedHub> {
  const hub = await createHub({
    logger: options.logger ?? false,
    config: {
      ...(options.port !== undefined ? { port: options.port } : {}),
      ...(options.host !== undefined ? { host: options.host } : {}),
      ...(options.dataDir !== undefined ? { dataDir: options.dataDir } : {}),
    },
  });
  const url = await hub.listen();
  const stop = async () => {
    await hub.close();
    process.exit(0);
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  return { hub, url };
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  const { hub, url } = await startHub({ logger: true });
  console.log(`Orbis hub listening on ${url}`);
  console.log(hub.config.tokenFile ? `API token: ${hub.config.tokenFile}` : "API token: from ORBIS_TOKEN");
}
