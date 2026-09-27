// specs/desktop-app — acceptance criterion 1 (the hub launcher).
import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import type { ChildProcess } from "node:child_process";
import { bundledHubEntry, ensureHub, healthy } from "../src/hub-launcher.js";

const cleanup: Array<() => void | Promise<void>> = [];
afterEach(async () => {
  for (const fn of cleanup.splice(0).reverse()) await fn();
});

function tempDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "orbis-desktop-"));
  cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address() as AddressInfo;
  await new Promise<void>((r) => server.close(() => r()));
  return port;
}

describe("hub launcher", () => {
  it("uses a hub that answers /health and starts nothing (criterion 1)", async () => {
    const server: Server = createServer((req, res) => {
      res.writeHead(req.url === "/health" ? 200 : 404, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, version: "test" }));
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    cleanup.push(() => new Promise<void>((r) => server.close(() => r())));
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const dataDir = tempDir();
    writeFileSync(path.join(dataDir, "token"), "local-token\n");
    let spawned = false;
    const hub = await ensureHub({ url, dataDir, spawnHub: () => ((spawned = true), null as unknown as ChildProcess) });
    expect(hub).toEqual({ url, token: "local-token", child: null });
    expect(spawned).toBe(false);
  });

  it("otherwise starts the bundled hub with Node.js on the configured address and waits for /health (criterion 1)", async () => {
    const port = await freePort();
    const url = `http://127.0.0.1:${port}`;
    const dataDir = tempDir();
    expect(await healthy(url)).toBe(false);
    const hub = await ensureHub({ url, dataDir, hubEntry: bundledHubEntry(), timeoutMs: 30_000 });
    cleanup.push(async () => {
      hub.child?.kill("SIGTERM");
      await new Promise((r) => hub.child?.once("exit", r) ?? r(null));
    });
    expect(hub.child).not.toBeNull();
    expect(hub.url).toBe(url);
    expect(await healthy(url)).toBe(true);
    expect(hub.token).toMatch(/^[A-Za-z0-9_-]{20,}$/); // the new hub's token file in its data directory
    const bots = await fetch(`${url}/api/v1/bots`, { headers: { authorization: `Bearer ${hub.token}` } });
    expect(bots.status).toBe(200);
  });

  it("reports a hub that exits or never answers, and refuses to start one for a remote address", async () => {
    const dataDir = tempDir();
    const crash = tempDir();
    const script = path.join(crash, "crash.mjs");
    writeFileSync(script, 'console.error("boom: port in use"); process.exit(3);');
    const port = await freePort();
    await expect(ensureHub({ url: `http://127.0.0.1:${port}`, dataDir, hubEntry: script, timeoutMs: 5_000 })).rejects.toThrow(/the bundled hub exited with code 3: boom: port in use/);

    const silent = path.join(crash, "silent.mjs");
    writeFileSync(silent, "setInterval(() => {}, 1000);");
    await expect(ensureHub({ url: `http://127.0.0.1:${await freePort()}`, dataDir, hubEntry: silent, timeoutMs: 700 })).rejects.toThrow(/did not answer .*\/health within/);

    await expect(ensureHub({ url: "https://orbis.example.invalid", dataDir, health: async () => false })).rejects.toThrow(/no Orbis hub answers at https:\/\/orbis.example.invalid/);
  });
});
