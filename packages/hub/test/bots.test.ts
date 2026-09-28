// specs/bots — acceptance criteria 1 to 5.
import { afterEach, describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { AVATAR_COLORS, AVATAR_SHAPES } from "@orbis/shared";
import type { ComputerProvider } from "../src/computer/manager.js";
import { newId, nowIso } from "../src/ids.js";
import { chat, createBot, testHub, type TestHub } from "./helpers.js";

let t: TestHub | null = null;
afterEach(async () => {
  await t?.cleanup();
  t = null;
});

describe("bots", () => {
  it("creates a bot with id, handle, initials and color, and keeps it across a hub restart (criterion 1)", async () => {
    t = await testHub();
    const res = await t.api("POST", "/api/v1/bots", {
      name: "Ana Souza",
      role: "QA lead",
      description: "Never send without approval.",
      brain: { kind: "mock" },
      tools: ["team.*", "http.fetch"],
      spendCapUsd: 5,
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      handle: "ana-souza",
      name: "Ana Souza",
      role: "QA lead",
      avatar: { initials: "AS" },
      state: "idle",
      spendCapUsd: 5,
    });
    expect(res.body.id).toMatch(/^bot_/);
    expect(res.body.avatar.color).toMatch(/^#[0-9a-f]{6}$/);

    // A new hub on the same data directory sees the same bot.
    const dir = t.dataDir;
    await t.hub.close();
    const again = await testHub({}, dir);
    try {
      const listed = await again.api("GET", "/api/v1/bots");
      expect(listed.body).toHaveLength(1);
      expect(listed.body[0]).toMatchObject({
        id: res.body.id,
        handle: "ana-souza",
        description: "Never send without approval.",
        brain: { kind: "mock" },
        tools: ["team.*", "http.fetch"],
        spendCapUsd: 5,
      });
    } finally {
      await again.cleanup();
    }
  });

  it("duplicates identity, description, brain, policy, computer and skills, but no memory or secrets (criterion 2)", async () => {
    t = await testHub();
    const source = await createBot(t, {
      description: "Durable rules",
      policy: { rules: [{ tool: "computer.shell", decision: "deny", locked: true }], grants: ["http.fetch"] },
      computer: { enabled: true, provider: "local", hibernateAfterMin: 10 },
      tools: ["computer.*"],
      skills: ["qa-report"],
    });
    t.hub.repos.memory.insert({
      id: newId("mem"),
      botId: source.id,
      kind: "fact",
      text: "the staging URL is private",
      source: "test",
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });
    t.hub.db.prepare("INSERT INTO secrets (bot_id, name, ciphertext, created_at) VALUES (?, ?, ?, ?)").run(source.id, "TOKEN", "x", nowIso());

    const res = await t.api("POST", `/api/v1/bots/${source.id}/duplicate`);
    expect(res.status).toBe(201);
    const copy = res.body;
    expect(copy.id).not.toBe(source.id);
    expect(copy.handle).not.toBe(source.handle);
    expect(copy.name).toBe("Ana (copy)");
    expect(copy).toMatchObject({
      role: source.role,
      description: "Durable rules",
      brain: source.brain,
      computer: source.computer,
      tools: ["computer.*"],
      skills: ["qa-report"],
    });
    expect(copy.policy.rules).toEqual(source.policy.rules);
    expect(copy.policy.grants).toEqual([]);
    expect(t.hub.repos.memory.countForBot(copy.id)).toBe(0);
    const secrets = t.hub.db.prepare("SELECT COUNT(*) AS n FROM secrets WHERE bot_id = ?").get(copy.id) as { n: number };
    expect(secrets.n).toBe(0);
  });

  it("deletes memory, routines, secrets and the direct conversation, and destroys the computer (criterion 3)", async () => {
    const destroyed: string[] = [];
    const spy: ComputerProvider = {
      kind: "spy",
      ensure: async () => undefined,
      exec: async () => ({ exitCode: 0, output: "", timedOut: false, droppedBytes: 0 }),
      stop: async () => undefined,
      view: async () => ({ vncPort: null, cdpPort: null }),
      destroy: async (botId) => void destroyed.push(botId),
    };
    t = await testHub({ computerProviders: [spy] });
    const bot = await createBot(t);
    const { conversation } = await chat(t, bot.id, "hello");
    const at = nowIso();
    t.hub.repos.memory.insert({ id: newId("mem"), botId: bot.id, kind: "fact", text: "x", source: "", createdAt: at, updatedAt: at });
    t.hub.db
      .prepare("INSERT INTO routines (id, bot_id, name, trigger, instruction, secret, created_at, updated_at) VALUES (?, ?, 'r', '{}', 'i', 's', ?, ?)")
      .run(newId("rtn"), bot.id, at, at);
    t.hub.db.prepare("INSERT INTO secrets (bot_id, name, ciphertext, created_at) VALUES (?, 'K', 'c', ?)").run(bot.id, at);
    const workspace = t.hub.computer.workspaceDir(bot.id);
    expect(existsSync(workspace)).toBe(true);

    const res = await t.api("DELETE", `/api/v1/bots/${bot.id}`);
    expect(res.status).toBe(204);
    const count = (table: string) =>
      (t!.hub.db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE bot_id = ?`).get(bot.id) as { n: number }).n;
    expect(count("memory")).toBe(0);
    expect(count("routines")).toBe(0);
    expect(count("secrets")).toBe(0);
    expect(count("runs")).toBe(0);
    expect((await t.api("GET", `/api/v1/conversations/${conversation.id}`)).status).toBe(404);
    expect(destroyed).toEqual([bot.id]);
    expect(existsSync(workspace)).toBe(false);
    expect(t.events.some((e) => e.type === "bot.deleted")).toBe(true);
  });

  it("refuses bots beyond ORBIS_MAX_BOTS and bad or duplicate handles (criterion 4)", async () => {
    t = await testHub({ config: { maxBots: 2 } });
    await createBot(t, { name: "One" });
    const two = await createBot(t, { name: "Two", handle: "two" });
    expect(two.handle).toBe("two");
    const third = await t.api("POST", "/api/v1/bots", { name: "Three", brain: { kind: "mock" } });
    expect(third.status).toBe(409);
    expect(third.body.error.code).toBe("limit_reached");

    await t.hub.close();
    t = await testHub();
    await createBot(t, { name: "Taken", handle: "taken" });
    const everyone = await t.api("POST", "/api/v1/bots", { name: "X", handle: "everyone" });
    expect(everyone.status).toBe(400);
    expect(everyone.body.error.fields.handle).toBeDefined();
    const short = await t.api("POST", "/api/v1/bots", { name: "X", handle: "A" });
    expect(short.status).toBe(400);
    const dup = await t.api("POST", "/api/v1/bots", { name: "X", handle: "taken" });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe("handle_taken");
    // A derived handle never collides: it gets a numeric suffix.
    const same = await createBot(t, { name: "Taken" });
    expect(same.handle).toBe("taken-2");
  });

  it("lists pinned bots first and leaves hidden bots out unless asked (criterion 5)", async () => {
    t = await testHub();
    const a = await createBot(t, { name: "Alpha" });
    const b = await createBot(t, { name: "Beta" });
    const c = await createBot(t, { name: "Gamma" });
    await t.api("PATCH", `/api/v1/bots/${c.id}`, { pinned: true });
    await t.api("PATCH", `/api/v1/bots/${b.id}`, { hidden: true });

    const visible = (await t.api("GET", "/api/v1/bots")).body.map((x: { id: string }) => x.id);
    expect(visible).toEqual([c.id, a.id]);
    const all = (await t.api("GET", "/api/v1/bots?includeHidden=true")).body.map((x: { id: string }) => x.id);
    expect(all[0]).toBe(c.id);
    expect(all).toContain(b.id);
    expect(all).toHaveLength(3);
  });

  it("keeps each bot's face: a shape and a color, derived when not given, kept by a duplicate", async () => {
    t = await testHub();
    const given = await t.api("POST", "/api/v1/bots", { name: "Dana", role: "Designer", avatarShape: "cloud", avatarColor: "#ec4899" });
    expect(given.body.avatar).toEqual({ initials: "DA", color: "#ec4899", shape: "cloud" });
    const derived = (await t.api("POST", "/api/v1/bots", { name: "Quinn", role: "QA" })).body;
    expect(AVATAR_SHAPES).toContain(derived.avatar.shape);
    expect(AVATAR_COLORS).toContain(derived.avatar.color);
    expect((await t.api("POST", "/api/v1/bots", { name: "Zed", avatarShape: "star" })).status).toBe(400);
    const edited = await t.api("PATCH", `/api/v1/bots/${given.body.id}`, { avatarShape: "drop" });
    expect(edited.body.avatar.shape).toBe("drop");
    const copy = await t.api("POST", `/api/v1/bots/${given.body.id}/duplicate`);
    expect(copy.body.avatar).toMatchObject({ color: "#ec4899", shape: "drop" });
  });

  it("gets a bot by handle and edits it", async () => {
    t = await testHub();
    const bot = await createBot(t, { name: "Engineer" });
    expect((await t.api("GET", "/api/v1/bots/engineer")).body.id).toBe(bot.id);
    const patched = await t.api("PATCH", `/api/v1/bots/${bot.id}`, { role: "Backend", handle: "eng" });
    expect(patched.body).toMatchObject({ role: "Backend", handle: "eng" });
    expect((await t.api("GET", "/api/v1/bots/nobody")).status).toBe(404);
  });
});
