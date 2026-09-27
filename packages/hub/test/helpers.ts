import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { StreamEvent } from "@orbis/shared";
import { createHub, type Hub, type HubOptions } from "../src/server.js";

export const TOKEN = "test-token";
export const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");

export interface TestHub {
  hub: Hub;
  dataDir: string;
  api<T = any>(method: string, url: string, body?: unknown, token?: string | null): Promise<{ status: number; body: T; headers: Record<string, unknown> }>;
  events: StreamEvent[];
  cleanup(): Promise<void>;
}

/** A real hub on a temporary data directory, with every bus event recorded. */
export async function testHub(opts: HubOptions = {}, dataDir?: string): Promise<TestHub> {
  const dir = dataDir ?? mkdtempSync(path.join(tmpdir(), "orbis-test-"));
  const hub = await createHub({
    env: {},
    ...opts,
    config: { dataDir: dir, token: TOKEN, port: 0, webDir: null, ...opts.config },
  });
  const events: StreamEvent[] = [];
  hub.bus.subscribe((e) => events.push(e));
  return {
    hub,
    dataDir: dir,
    events,
    async api(method, url, body, token = TOKEN) {
      const res = await hub.app.inject({
        method: method as "GET",
        url,
        headers: token ? { authorization: `Bearer ${token}` } : {},
        ...(body !== undefined ? { payload: body as object } : {}),
      });
      let parsed: unknown = res.body;
      try {
        parsed = res.body ? JSON.parse(res.body) : null;
      } catch {
        /* not JSON */
      }
      return { status: res.statusCode, body: parsed as never, headers: res.headers };
    },
    async cleanup() {
      await hub.close();
      if (!dataDir) rmSync(dir, { recursive: true, force: true });
    },
  };
}

export const mockBrain = { kind: "mock" } as const;

/** Create a mock-brained bot through the API and return it. */
export async function createBot(t: TestHub, body: Record<string, unknown> = {}) {
  const res = await t.api("POST", "/api/v1/bots", { name: "Ana", role: "QA", brain: mockBrain, ...body });
  if (res.status !== 201) throw new Error(`create bot failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
}

/** Send a message to a bot's direct conversation and wait for every run it started. */
export async function chat(t: TestHub, botId: string, text: string) {
  const conv = (await t.api("GET", `/api/v1/bots/${botId}/conversation`)).body;
  const posted = await t.api("POST", `/api/v1/conversations/${conv.id}/messages`, { text });
  if (posted.status !== 201) throw new Error(`post failed: ${posted.status} ${JSON.stringify(posted.body)}`);
  const runs = await Promise.all(posted.body.runs.map((r: { id: string }) => t.hub.engine.wait(r.id)));
  return { conversation: conv, item: posted.body.item, runs };
}
