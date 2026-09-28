// specs/hub-api — acceptance criteria 1 and 2.
import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadConfig } from "../src/config.js";
import { testHub, type TestHub } from "./helpers.js";

let t: TestHub | null = null;
afterEach(async () => {
  await t?.cleanup();
  t = null;
});

describe("hub api", () => {
  it("answers 401 without a token, 200 on /health, and publishes the OpenAPI document (criterion 1)", async () => {
    t = await testHub();
    expect((await t.api("GET", "/api/v1/bots", undefined, null)).status).toBe(401);
    expect((await t.api("GET", "/api/v1/bots", undefined, "wrong")).status).toBe(401);
    expect((await t.api("POST", "/v1/chat/completions", {}, null)).status).toBe(401);
    const unauth = await t.api("GET", "/api/v1/bots", undefined, null);
    expect(unauth.body).toEqual({ error: { code: "unauthorized", message: "missing or invalid token" } });

    const health = await t.api("GET", "/health", undefined, null);
    expect(health.status).toBe(200);
    expect(health.body).toMatchObject({ ok: true });

    const doc = await t.api("GET", "/api/v1/openapi.json");
    expect(doc.status).toBe(200);
    expect(doc.body.openapi).toBe("3.1.0");
    expect(Object.keys(doc.body.paths)).toEqual(expect.arrayContaining(["/api/v1/bots", "/api/v1/bots/{id}", "/api/v1/conversations/{id}/messages"]));
  });

  it("answers 400 naming each failing field (criterion 2)", async () => {
    t = await testHub();
    const missing = await t.api("POST", "/api/v1/bots", { role: "QA" });
    expect(missing.status).toBe(400);
    expect(missing.body.error.code).toBe("invalid_request");
    expect(Object.keys(missing.body.error.fields)).toContain("name");

    const badBrain = await t.api("POST", "/api/v1/bots", { name: "X", brain: { kind: "gpt-9000" } });
    expect(badBrain.status).toBe(400);
    expect(Object.keys(badBrain.body.error.fields).some((k) => k.startsWith("brain"))).toBe(true);

    const extra = await t.api("POST", "/api/v1/bots", { name: "X", surprise: true });
    expect(extra.status).toBe(400);
    expect(Object.keys(extra.body.error.fields).join(" ")).toMatch(/surprise|body/);
  });

  it("answers JSON 404 for unknown API paths", async () => {
    t = await testHub();
    const res = await t.api("GET", "/api/v1/nothing-here");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("not_found");
  });
});

describe("configuration", () => {
  it("treats empty variables as unset and generates a private token file", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "orbis-cfg-"));
    const config = loadConfig({ ORBIS_DATA_DIR: dir, ORBIS_PORT: "", ORBIS_TOKEN: "  ", ORBIS_COMPUTER_PROVIDER: "" });
    expect(config.port).toBe(7420);
    expect(config.host).toBe("127.0.0.1");
    expect(config.computerProvider).toBe("local");
    expect(config.tokenFile).toBe(path.join(dir, "token"));
    expect(readFileSync(config.tokenFile!, "utf8").trim()).toBe(config.token);
    expect(statSync(config.tokenFile!).mode & 0o777).toBe(0o600);
    // The same file is read on the next start.
    expect(loadConfig({ ORBIS_DATA_DIR: dir }).token).toBe(config.token);
  });

  it("rejects invalid numbers and enums", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "orbis-cfg-"));
    expect(() => loadConfig({ ORBIS_DATA_DIR: dir, ORBIS_PORT: "abc" })).toThrow(/ORBIS_PORT/);
    expect(() => loadConfig({ ORBIS_DATA_DIR: dir, ORBIS_COMPUTER_PROVIDER: "vm" })).toThrow(/local\|host\|docker/);
    expect(loadConfig({ ORBIS_DATA_DIR: dir, ORBIS_TOKEN: "abc", ORBIS_MAX_BOTS: "7" })).toMatchObject({ token: "abc", tokenFile: null, maxBots: 7 });
  });
});
