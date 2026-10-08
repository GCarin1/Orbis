import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import { createHub, type Hub } from "@orbis/hub";
import { main } from "../src/main.js";
import type { Io } from "../src/io.js";

export const TOKEN = "cli-test-token";

export interface Captured {
  code: number;
  stdout: string;
  stderr: string;
}

export function makeIo(
  env: Record<string, string | undefined>,
  stdinText?: string,
  interactive = false,
): { io: Io; stdout: () => string; stderr: () => string } {
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const stdin = new PassThrough();
  let out = "";
  let errText = "";
  stdout.on("data", (d) => (out += d));
  stderr.on("data", (d) => (errText += d));
  if (stdinText !== undefined) stdin.end(stdinText);
  return {
    io: { stdout, stderr, stdin, env, interactive, color: false },
    stdout: () => out,
    stderr: () => errText,
  };
}

export async function runCli(
  argv: string[],
  env: Record<string, string | undefined>,
  stdinText?: string,
  interactive = false,
): Promise<Captured> {
  const { io, stdout, stderr } = makeIo(env, stdinText, interactive);
  const code = await main(argv, io);
  return { code, stdout: stdout(), stderr: stderr() };
}

export async function startTestHub(
  opts: { fetch?: typeof fetch } = {},
): Promise<{ hub: Hub; url: string; env: Record<string, string>; cleanup(): Promise<void> }> {
  const dataDir = mkdtempSync(path.join(tmpdir(), "orbis-cli-hub-"));
  const home = mkdtempSync(path.join(tmpdir(), "orbis-cli-home-"));
  const hub = await createHub({
    env: {},
    config: { dataDir, token: TOKEN, port: 0, webDir: null },
    ...(opts.fetch ? { auth: { fetch: opts.fetch }, cloud: { fetch: opts.fetch } } : {}),
  });
  const url = await hub.listen();
  return {
    hub,
    url,
    env: { HOME: home, ORBIS_URL: url, ORBIS_TOKEN: TOKEN },
    async cleanup() {
      await hub.close();
      rmSync(dataDir, { recursive: true, force: true });
      rmSync(home, { recursive: true, force: true });
    },
  };
}
