// specs/hub-api — acceptance criterion 4 (stream subscription filter).
import { afterEach, describe, expect, it } from "vitest";
import type { StreamEvent } from "@orbis/shared";
import { matchesFilter } from "../src/api/stream.js";
import { chat, createBot, testHub, TOKEN, type TestHub } from "./helpers.js";

let t: TestHub | null = null;
afterEach(async () => {
  await t?.cleanup();
  t = null;
});

function connect(url: string): Promise<{ ws: WebSocket; events: StreamEvent[]; next(type: string): Promise<StreamEvent> }> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const events: StreamEvent[] = [];
    const waiters: Array<{ type: string; resolve: (e: StreamEvent) => void }> = [];
    ws.onmessage = (msg) => {
      const e = JSON.parse(String(msg.data)) as StreamEvent;
      events.push(e);
      for (const w of [...waiters]) {
        if (w.type === e.type) {
          waiters.splice(waiters.indexOf(w), 1);
          w.resolve(e);
        }
      }
    };
    ws.onerror = () => reject(new Error("websocket error"));
    ws.onopen = () =>
      resolve({
        ws,
        events,
        next: (type) => new Promise((res) => waiters.push({ type, resolve: res })),
      });
  });
}

describe("stream", () => {
  it("delivers only the subscribed conversation's items, plus account-wide events (criterion 4)", async () => {
    t = await testHub();
    const base = (await t.hub.listen()).replace("http", "ws");
    const ana = await createBot(t, { name: "Ana" });
    const bob = await createBot(t, { name: "Bob" });
    const anaConv = (await t.api("GET", `/api/v1/bots/${ana.id}/conversation`)).body;
    await t.api("GET", `/api/v1/bots/${bob.id}/conversation`);

    const { ticket } = (await t.api("POST", "/api/v1/stream/ticket")).body as { ticket: string };
    const client = await connect(`${base}/api/v1/stream?ticket=${ticket}`);
    client.ws.send(JSON.stringify({ type: "subscribe", conversations: [anaConv.id] }));
    await client.next("subscribed");

    await chat(t, bob.id, "for bob only");
    await chat(t, ana.id, "for ana");
    await new Promise((r) => setTimeout(r, 100));
    client.ws.close();

    const items = client.events.filter((e) => e.type === "timeline.item");
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((e) => (e.data as { conversationId: string }).conversationId === anaConv.id)).toBe(true);
    const botStates = client.events.filter((e) => e.type === "bot.state").map((e) => (e.data as { botId: string }).botId);
    expect(botStates).toContain(bob.id); // account-wide
    expect(client.events.some((e) => e.type === "run.step" && (e.data as { botId: string }).botId === bob.id)).toBe(false);
  });

  it("opens only with a ticket, once, and never with the token in the address", async () => {
    t = await testHub();
    const base = (await t.hub.listen()).replace("http", "ws");
    await expect(connect(`${base}/api/v1/stream?token=${TOKEN}`)).rejects.toThrow();
    await expect(connect(`${base}/api/v1/stream?ticket=nope`)).rejects.toThrow();
    const { ticket, expiresAt } = (await t.api("POST", "/api/v1/stream/ticket")).body as { ticket: string; expiresAt: string };
    expect(Date.parse(expiresAt) - Date.now()).toBeLessThanOrEqual(60_000);
    (await connect(`${base}/api/v1/stream?ticket=${ticket}`)).ws.close();
    await expect(connect(`${base}/api/v1/stream?ticket=${ticket}`)).rejects.toThrow();
  });

  it("matches events against a filter", () => {
    const e = (type: string, data: object) => ({ type, data, ts: "" }) as StreamEvent;
    const filter = new Set(["c1"]);
    expect(matchesFilter(e("timeline.item", { conversationId: "c1" }), filter)).toBe(true);
    expect(matchesFilter(e("timeline.item", { conversationId: "c2" }), filter)).toBe(false);
    expect(matchesFilter(e("bot.state", { botId: "b" }), filter)).toBe(true);
    expect(matchesFilter(e("run.updated", { run: { conversationId: "c1" } }), filter)).toBe(true);
    expect(matchesFilter(e("timeline.item", { conversationId: "c2" }), null)).toBe(true);
  });
});
