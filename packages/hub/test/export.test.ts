// specs/cloud — export and import (change 0065-export-import): a `.orbis` file carries every table, file and
// skill of a hub and its secrets sealed by a password; it imports into another hub without duplicates, and
// into the user's cloud account through its session, never with the secrets.
import { afterEach, describe, expect, it, vi } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { createHmac, generateKeyPairSync, sign, type KeyObject } from "node:crypto";
import path from "node:path";
import type { ImportReport } from "@orbis/shared";
import { readZip, writeZip, ZipError } from "../src/export/zip.js";
import { seal, unseal, WrongPassword } from "../src/export/seal.js";
import { CLOUD, ExportService, TABLES } from "../src/export/service.js";
import { DEFAULT_SUPABASE } from "../src/config.js";
import { chat, createBot, testHub, TOKEN, type TestHub } from "./helpers.js";

const PASSWORD = "a long export password";
const hubs: TestHub[] = [];
afterEach(async () => {
  for (const t of hubs.splice(0)) await t.cleanup();
});
const hub = async (opts: Parameters<typeof testHub>[0] = {}) => {
  const t = await testHub(opts);
  hubs.push(t);
  return t;
};

/** Ask the hub for its export; the bytes of the `.orbis` file. */
async function exportOf(t: TestHub, password?: string): Promise<Buffer> {
  const res = await t.hub.app.inject({ method: "POST", url: "/api/v1/export", headers: { authorization: `Bearer ${TOKEN}` }, payload: password ? { password } : {} });
  expect(res.statusCode).toBe(200);
  expect(res.headers["content-type"]).toBe("application/zip");
  expect(res.headers["content-disposition"]).toMatch(/^attachment; filename="orbis-\d{4}-\d\d-\d\d\.orbis"$/);
  return res.rawPayload;
}

async function importInto(t: TestHub, zip: Buffer, headers: Record<string, string> = {}, url = "/api/v1/import") {
  const res = await t.hub.app.inject({ method: "POST", url, headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/octet-stream", ...headers }, payload: zip });
  return { status: res.statusCode, body: JSON.parse(res.body) as ImportReport & { error?: { code: string; message: string } } };
}

/** A hub with something of everything: bots and their secrets, a group, messages, a file, a skill, a routine, health. */
async function fullHub() {
  const t = await hub();
  const ana = await createBot(t, { name: "Ana" });
  const bia = await createBot(t, { name: "Bia", role: "Dev" });
  await t.api("PUT", `/api/v1/bots/${ana.id}/secrets/GITHUB_TOKEN`, { value: "ghp_secret_value_0001" });
  t.hub.secrets.hubSecrets.set("TRANSCRIBE_API_KEY", "gsk_hub_value_0002");
  t.hub.secrets.hubSecrets.set("mcp.srv_x.oauth", JSON.stringify({ tokens: { access_token: "old-hub-only" } }));
  t.hub.db.prepare("INSERT INTO settings (key, value) VALUES ('account', '{\"userId\":\"x\"}')").run();
  await chat(t, ana.id, "hello Ana");
  const group = await t.api("POST", "/api/v1/conversations", { title: "Team", members: [ana.id, bia.id], leadBotId: ana.id });
  expect(group.status).toBe(201);
  const conv = (await t.api("GET", `/api/v1/bots/${ana.id}/conversation`)).body;
  const up = await t.hub.app.inject({
    method: "POST",
    url: `/api/v1/conversations/${conv.id}/files`,
    headers: { authorization: `Bearer ${TOKEN}`, "x-file-name": "notes.txt", "content-type": "text/plain" },
    payload: "the notes",
  });
  const file = JSON.parse(up.body) as { id: string };
  await t.api("POST", `/api/v1/conversations/${conv.id}/messages`, { text: "", attachments: [file.id] });
  await t.hub.engine.idle();
  await t.api("POST", "/api/v1/skills", { content: "---\nname: weekly-report\ndescription: The weekly report\n---\nSteps." });
  const routine = (await t.api("POST", `/api/v1/bots/${ana.id}/routines`, { name: "Report", trigger: { type: "webhook" }, instruction: "/reply ok" })).body as { id: string };
  t.hub.db.prepare("UPDATE routines SET enabled = 1 WHERE id = ?").run(routine.id);
  await t.api("PUT", "/api/v1/health/sync", { days: [{ date: "2026-10-07", metrics: { steps: 4321 } }], sources: ["com.huami.watch.hmwatchmanager"] });
  // Bia worked on the old machine itself ("my computer").
  t.hub.db.prepare("UPDATE bots SET computer = ? WHERE id = ?").run(JSON.stringify({ enabled: true, provider: "host", hostDir: "/home/old" }), bia.id);
  return { t, ana, bia, conv, file, routine };
}

describe("the .orbis file", () => {
  it("zips and unzips, and refuses damaged parts and unsafe paths", () => {
    const zip = writeZip([
      { path: "a/b.txt", data: Buffer.from("hello ".repeat(100)) },
      { path: "empty", data: Buffer.alloc(0) },
      { path: "img.png", data: Buffer.from([0x89, 0x50, 0x4e, 0x47]) },
    ]);
    expect(readZip(zip).map((e) => [e.path, e.data.toString("latin1")])).toEqual([
      ["a/b.txt", "hello ".repeat(100)],
      ["empty", ""],
      ["img.png", "\x89PNG"],
    ]);
    const damaged = Buffer.from(zip);
    damaged[40] ^= 0xff;
    expect(() => readZip(damaged)).toThrow(ZipError);
    expect(() => writeZip([{ path: "../escape", data: Buffer.from("x") }])).toThrow(ZipError);
    expect(() => readZip(Buffer.from("not a zip at all, not even close to one"))).toThrow(ZipError);
  });

  it("seals the secrets with the password: a wrong one or a changed byte does not open them", () => {
    const sealed = seal({ a: 1 }, PASSWORD);
    expect(JSON.stringify(sealed)).not.toContain('"a"');
    expect(unseal(sealed, PASSWORD)).toEqual({ a: 1 });
    expect(() => unseal(sealed, "another long password")).toThrow(WrongPassword);
    expect(() => unseal({ ...sealed, data: Buffer.from("x").toString("base64") }, PASSWORD)).toThrow(WrongPassword);
    expect(() => seal({}, "short")).toThrow(/10 characters/);
    expect(() => unseal({ ...sealed, N: 2 ** 22 }, PASSWORD)).toThrow(/too much/);
  });
});

describe("exporting a hub", () => {
  it("holds every table but the vault, the files, the skills and the secrets sealed; nothing of this hub's own", async () => {
    const { t } = await fullHub();
    const zip = await exportOf(t, PASSWORD);
    const parts = new Map(readZip(zip).map((e) => [e.path, e.data]));
    const manifest = JSON.parse(parts.get("manifest.json")!.toString()) as { counts: Record<string, number>; files: number; skills: number; secrets: boolean; parts: { path: string }[] };
    expect(Object.keys(manifest.counts)).toEqual([...TABLES]);
    expect(manifest.counts.bots).toBe(2);
    expect(manifest.files).toBe(1);
    expect(manifest.skills).toBe(1);
    expect(manifest.secrets).toBe(true);
    expect([...parts.keys()]).toContain("skills/weekly-report/SKILL.md");
    // No secret in clear anywhere but sealed; no vault, no routine secret, no linked account.
    const clear = [...parts.entries()].filter(([p]) => p !== "secrets.sealed.json").map(([, d]) => d.toString("latin1")).join("\n");
    for (const secret of ["ghp_secret_value_0001", "gsk_hub_value_0002", "old-hub-only", '"secret":', "secret:TRANSCRIBE", '"key":"account"']) expect(clear).not.toContain(secret);
    expect([...parts.keys()].some((p) => p.includes("secrets.jsonl") || p.includes("brain_sessions"))).toBe(false);

    const bare = new Map(readZip(await exportOf(t)).map((e) => [e.path, e.data]));
    expect(bare.has("secrets.sealed.json")).toBe(false);
    expect((await t.hub.app.inject({ method: "POST", url: "/api/v1/export", headers: { authorization: `Bearer ${TOKEN}` }, payload: { password: "short" } })).statusCode).toBe(400);
    expect((await t.hub.app.inject({ method: "POST", url: "/api/v1/export", payload: {} })).statusCode).toBe(401);
  });
});

describe("importing into a hub", () => {
  it("brings everything with the password, adds nothing twice, and never keeps a 'my computer' consent", async () => {
    const { t: old, ana, bia, file, routine } = await fullHub();
    const zip = await exportOf(old, PASSWORD);
    const fresh = await hub();

    const wrong = await importInto(fresh, zip, { "x-orbis-export-password": encodeURIComponent("not the password!") });
    expect(wrong.status).toBe(400);
    expect(wrong.body.error!.code).toBe("wrong_password");
    expect((await fresh.api("GET", "/api/v1/bots")).body).toEqual([]);

    const first = await importInto(fresh, zip, { "x-orbis-export-password": encodeURIComponent(PASSWORD) });
    expect(first.status).toBe(200);
    expect(first.body.tables.bots).toEqual({ added: 2, skipped: 0 });
    expect(first.body.tables.items!.added).toBeGreaterThan(2);
    expect(first.body.files).toEqual({ added: 1, skipped: 0 });
    expect(first.body.skills).toEqual({ added: 1, skipped: 0 });
    expect(first.body.secrets).toEqual({ added: 2, skipped: 0, inFile: true, opened: true });
    expect(first.body.warnings.join(" ")).toMatch(/isolated computer/);

    // The bots, their secrets in this hub's vault, the file, the skill, the routine's webhook secret, health.
    const bots = (await fresh.api("GET", "/api/v1/bots")).body as Array<{ id: string; name: string; computer: { provider?: string; hostDir?: string } }>;
    expect(bots.map((b) => b.name).sort()).toEqual(["Ana", "Bia"]);
    expect(bots.find((b) => b.id === bia.id)!.computer).toMatchObject({ provider: "local" });
    expect(bots.find((b) => b.id === bia.id)!.computer.hostDir).toBeUndefined();
    expect(fresh.hub.secrets.vault.get(ana.id, "GITHUB_TOKEN")).toBe("ghp_secret_value_0001");
    expect(fresh.hub.secrets.hubSecrets.get("TRANSCRIBE_API_KEY")).toBe("gsk_hub_value_0002");
    expect(fresh.hub.secrets.hubSecrets.has("mcp.srv_x.oauth")).toBe(false);
    expect(readFileSync(path.join(fresh.hub.files.dir, file.id), "utf8")).toBe("the notes");
    expect(existsSync(path.join(fresh.dataDir, "skills", "weekly-report", "SKILL.md"))).toBe(true);
    const oldSecret = (old.hub.db.prepare("SELECT secret FROM routines WHERE id = ?").get(routine.id) as { secret: string }).secret;
    const body = JSON.stringify({ ping: 1 });
    const hook = await fresh.hub.app.inject({
      method: "POST",
      url: `/hooks/routines/${routine.id}`,
      payload: body,
      headers: { "content-type": "application/json", "x-orbis-signature": `sha256=${createHmac("sha256", oldSecret).update(body).digest("hex")}` },
    });
    expect(hook.statusCode).toBe(202);
    expect((await fresh.api("GET", "/api/v1/health/status")).body).toMatchObject({ days: 1 });
    expect(fresh.hub.db.prepare("SELECT value FROM settings WHERE key = 'account'").get()).toBeUndefined();
    await fresh.hub.engine.idle();

    const again = await importInto(fresh, zip, { "x-orbis-export-password": encodeURIComponent(PASSWORD) });
    expect(again.status).toBe(200);
    for (const [table, counts] of Object.entries(again.body.tables)) expect(counts.added, table).toBe(0);
    expect(again.body.files).toEqual({ added: 0, skipped: 1 });
    expect(again.body.secrets.added).toBe(0);
    expect(((await fresh.api("GET", "/api/v1/bots")).body as unknown[]).length).toBe(2);
  });

  it("without the password brings everything but the secrets, and says so", async () => {
    const { t: old } = await fullHub();
    const fresh = await hub();
    const res = await importInto(fresh, await exportOf(old, PASSWORD));
    expect(res.status).toBe(200);
    expect(res.body.secrets).toEqual({ added: 0, skipped: 0, inFile: true, opened: false });
    expect(res.body.warnings.join(" ")).toMatch(/give its password/);
    expect(res.body.warnings.join(" ")).toMatch(/webhook\(s\) got a new secret/);
  });

  it("refuses a changed file, another bot under the same handle, and something that is not an export", async () => {
    const { t: old } = await fullHub();
    const zip = await exportOf(old);
    const entries = readZip(zip).map((e) => (e.path === "tables/bots.jsonl" ? { ...e, data: Buffer.from(e.data.toString().replace("Ana", "Eve")) } : e));
    const fresh = await hub();
    const changed = await importInto(fresh, writeZip(entries));
    expect(changed.status).toBe(400);
    expect(changed.body.error!.message).toMatch(/tables\/bots\.jsonl was changed/);
    expect((await importInto(fresh, Buffer.from("hello"))).body.error!.code).toBe("invalid_export");

    await createBot(fresh, { name: "Ana" });
    const clash = await importInto(fresh, zip);
    expect(clash.status).toBe(409);
    expect(clash.body.error!.code).toBe("import_conflict");
    expect(((await fresh.api("GET", "/api/v1/bots")).body as unknown[]).length).toBe(1);
  });
});

/** The cloud: the project's sign-in keys and its database API, recording what the hub sends. */
function cloud() {
  const pair = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const issuer = `${DEFAULT_SUPABASE.url}/auth/v1`;
  const b64 = (v: object) => Buffer.from(JSON.stringify(v)).toString("base64url");
  const session = (key: KeyObject = pair.privateKey) => {
    const now = Math.floor(Date.now() / 1000);
    const head = `${b64({ alg: "ES256", kid: "k1" })}.${b64({ iss: issuer, aud: "authenticated", role: "authenticated", sub: "6f1c2a4e-9b1d-4c3e-8f2a-1b2c3d4e5f60", exp: now + 600 })}`;
    return `${head}.${sign("sha256", Buffer.from(head), { key, dsaEncoding: "ieee-p1363" }).toString("base64url")}`;
  };
  const seen = new Map<string, unknown[]>();
  const requests: Array<{ url: string; headers: Record<string, string> }> = [];
  const fetchMock = vi.fn(async (url: string | URL | Request, init: RequestInit = {}) => {
    const u = String(url);
    if (u.endsWith("/.well-known/jwks.json")) return Response.json({ keys: [{ ...pair.publicKey.export({ format: "jwk" }), kid: "k1", alg: "ES256", use: "sig" }] });
    requests.push({ url: u, headers: init.headers as Record<string, string> });
    const table = new URL(u).pathname.split("/").pop()!;
    const rows = JSON.parse(String(init.body)) as Array<Record<string, unknown>>;
    const key = CLOUD[table as keyof typeof CLOUD].key;
    const kept = seen.get(table) ?? [];
    const fresh = rows.filter((r) => !kept.some((k) => key.every((c) => (k as Record<string, unknown>)[c] === r[c])));
    seen.set(table, [...kept, ...fresh]);
    return Response.json(fresh.map((r) => ({ [key[0]!]: r[key[0]!] })), { status: 201 });
  });
  return { fetchMock, session, seen, requests, other: () => session(generateKeyPairSync("ec", { namedCurve: "P-256" }).privateKey) };
}

describe("importing into the cloud account", () => {
  it("writes every table under the account's session, as the cloud's columns take them, never a secret, never twice", async () => {
    const { t: old, routine } = await fullHub();
    const zip = await exportOf(old, PASSWORD);
    const c = cloud();
    const t = await hub({ auth: { fetch: c.fetchMock as typeof fetch }, cloud: { fetch: c.fetchMock as typeof fetch } });
    const session = c.session();

    const first = await importInto(t, zip, { "x-orbis-account": session }, "/api/v1/import/cloud");
    expect(first.status).toBe(200);
    expect(first.body.target).toBe("cloud");
    expect(first.body.tables.bots).toEqual({ added: 2, skipped: 0 });
    expect(first.body.warnings.join(" ")).toMatch(/secrets stay in the file/);
    const req = c.requests.find((r) => r.url.includes("/rest/v1/bots"))!;
    expect(req.url).toBe(`${DEFAULT_SUPABASE.url}/rest/v1/bots?on_conflict=owner_id,id&select=id`);
    expect(req.headers).toMatchObject({ apikey: DEFAULT_SUPABASE.key, authorization: `Bearer ${session}`, prefer: "resolution=ignore-duplicates,return=representation" });
    // Tables in the order of their references, columns as the cloud has them.
    expect(c.requests.map((r) => new URL(r.url).pathname.split("/").pop())).toEqual(TABLES.filter((tb) => (c.seen.get(tb) ?? []).length));
    const bot = c.seen.get("bots")![0] as Record<string, unknown>;
    expect(typeof bot.brain).toBe("object");
    expect(typeof bot.pinned).toBe("boolean");
    expect(bot).not.toHaveProperty("owner_id");
    expect(c.seen.get("items")!.every((i) => !("seq" in (i as object)))).toBe(true);
    expect(c.seen.get("routines")!.find((r) => (r as { id: string }).id === routine.id)).not.toHaveProperty("secret");
    expect((c.seen.get("settings") ?? []).map((s) => (s as { key: string }).key).filter((k) => k.startsWith("secret:") || k === "account")).toEqual([]);
    expect(JSON.stringify([...c.seen.values()])).not.toMatch(/ghp_secret_value_0001|gsk_hub_value_0002/);
    expect((c.seen.get("bots") as Array<{ computer: { provider?: string } }>).every((b) => b.computer.provider !== "host")).toBe(true);

    const again = await importInto(t, zip, { "x-orbis-account": session }, "/api/v1/import/cloud");
    for (const [table, counts] of Object.entries(again.body.tables)) expect(counts.added, table).toBe(0);

    expect((await importInto(t, zip, { "x-orbis-account": c.other() }, "/api/v1/import/cloud")).status).toBe(401);
    expect((await importInto(t, zip, {}, "/api/v1/import/cloud")).status).toBe(401);
  });

  it("maps every exported column onto a column of the cloud schema, with its type", async () => {
    const sql = readFileSync(path.resolve(import.meta.dirname, "../../../supabase/migrations/0001_orbis_core.sql"), "utf8");
    const t = await hub();
    for (const table of TABLES) {
      const body = sql.slice(sql.indexOf(`create table public.${table} (`)).split("\n);")[0]!;
      const cloudColumns = new Map(
        [...body.matchAll(/^\s{2}(\w+) (\w+)/gm)].filter((m) => !["primary", "unique", "foreign", "constraint", "check"].includes(m[1]!)).map((m) => [m[1]!, m[2]!]),
      );
      const spec = CLOUD[table];
      const hubColumns = (t.hub.db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map((c) => c.name).filter((c) => c !== "seq" && !spec.drop?.includes(c));
      for (const col of hubColumns) expect(cloudColumns.has(col), `${table}.${col} has no cloud column`).toBe(true);
      expect([...cloudColumns].filter(([, type]) => type === "jsonb").map(([c]) => c).sort(), `${table} json`).toEqual([...(spec.json ?? [])].sort());
      expect([...cloudColumns].filter(([, type]) => type === "boolean").map(([c]) => c).sort(), `${table} booleans`).toEqual([...(spec.bool ?? [])].sort());
    }
    expect(ExportService.cloudRow("settings", { key: "secret:X", value: "v" })).toBeNull();
  });
});
