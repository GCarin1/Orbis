// specs/approvals — acceptance criterion 4 (drafts leave only on Send).
import { afterEach, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { chat, createBot, testHub, type TestHub } from "../helpers.js";

let t: TestHub | null = null;
let server: Server | null = null;
afterEach(async () => {
  await t?.cleanup();
  t = null;
  await new Promise<void>((r) => (server ? server.close(() => r()) : r()));
  server = null;
});

async function receiver(): Promise<{ url: string; received: unknown[] }> {
  const received: unknown[] = [];
  server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      received.push(JSON.parse(body));
      res.writeHead(204).end();
    });
  });
  await new Promise<void>((r) => server!.listen(0, "127.0.0.1", r));
  return { url: `http://127.0.0.1:${(server!.address() as AddressInfo).port}/hook`, received };
}

async function draftCard(t: TestHub, botId: string, fields: Record<string, unknown>) {
  const { conversation } = await chat(t, botId, `/tool draft.create ${JSON.stringify(fields)}`);
  const items = (await t.api("GET", `/api/v1/conversations/${conversation.id}/items`)).body;
  return items.find((i: { kind: string; card?: { type: string } }) => i.kind === "card" && i.card?.type === "draft");
}

describe("drafts", () => {
  it("delivers a webhook draft only after Send, with the user's edits (criterion 4)", async () => {
    const hook = await receiver();
    t = await testHub();
    const bot = await createBot(t);
    const card = await draftCard(t, bot.id, { channel: "webhook", to: "#qa", body: "Deploy passed", url: hook.url });
    expect(card.card).toMatchObject({ state: "pending", data: { channel: "webhook", to: "#qa", body: "Deploy passed" } });
    await new Promise((r) => setTimeout(r, 100));
    expect(hook.received).toHaveLength(0);

    const sent = await t.api("POST", `/api/v1/cards/${card.id}/send`, { fields: { body: "Deploy passed ✅ (checked by me)" } });
    expect(sent.status).toBe(200);
    expect(sent.body.card).toMatchObject({ state: "sent", data: { body: "Deploy passed ✅ (checked by me)", delivery: { ok: true, detail: "HTTP 204" } } });
    expect(hook.received).toEqual([expect.objectContaining({ channel: "webhook", to: "#qa", body: "Deploy passed ✅ (checked by me)" })]);
    expect((await t.api("POST", `/api/v1/cards/${card.id}/send`, {})).status).toBe(409);
  });

  it("never delivers a discarded draft (criterion 4)", async () => {
    const hook = await receiver();
    t = await testHub();
    const bot = await createBot(t);
    const card = await draftCard(t, bot.id, { channel: "webhook", to: "#qa", body: "oops", url: hook.url });
    const discarded = await t.api("POST", `/api/v1/cards/${card.id}/discard`);
    expect(discarded.body.card.state).toBe("discarded");
    expect((await t.api("POST", `/api/v1/cards/${card.id}/send`, {})).status).toBe(409);
    expect(hook.received).toHaveLength(0);
  });

  it("appends non-webhook drafts to the outbox on Send", async () => {
    t = await testHub();
    const bot = await createBot(t);
    const card = await draftCard(t, bot.id, { channel: "email", to: "cto@example.com", subject: "Weekly QA", body: "All green." });
    const outbox = path.join(t.dataDir, "outbox.jsonl");
    expect(existsSync(outbox)).toBe(false);
    const sent = await t.api("POST", `/api/v1/cards/${card.id}/send`, {});
    expect(sent.body.card.state).toBe("sent");
    const lines = readFileSync(outbox, "utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(lines).toEqual([expect.objectContaining({ channel: "email", to: "cto@example.com", subject: "Weekly QA", body: "All green." })]);
  });

  it("refuses a webhook draft without a URL", async () => {
    t = await testHub();
    const bot = await createBot(t);
    const { runs } = await chat(t, bot.id, '/tool draft.create {"channel":"webhook","to":"x","body":"y"}');
    expect(runs[0].steps.find((s: { type: string }) => s.type === "tool_result")).toMatchObject({ isError: true });
  });
});
