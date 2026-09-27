import type { HubClient } from "./client.js";
import type { Connection } from "./config.js";
import type { Io } from "./io.js";

export interface CommandContext {
  io: Io;
  json: boolean;
  connection(): Connection;
  client(): HubClient;
}
