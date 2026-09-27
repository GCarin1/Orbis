// specs/secrets — acceptance criteria 1 to 4.
import { afterEach, describe, expect, it } from "vitest";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { all } from "../src/db/index.js";
import { loadMasterKey, Vault } from "../src/secrets/vault.js";
import { chat, createBot, testHub, type TestHub } from "./helpers.js";

let t: TestHub | null = null;
afterEach(async () => {
  await t?.cleanup();
  t = null;
});

const VALUE = "ghp_S3cr3tV4lu3-do-not-leak";
const allowShell = { rules: [{ tool: "computer.shell", decision: "allow" }], grants: [] };
const until = async (check: () => boolean | Promise<boolean>) => {
  for (let i = 0; i < 300 && !(await check()); i++) await new Promise((r) => setTimeout(r, 10));
};

describe("secrets", () => {
  it("stores values encrypted under a 0600 master key, bound to the bot and the name (criterion 1)", async () => {
    t = await testHub();
    const bot = await createBot(t);
    const keyFile = path.join(t.dataDir, "master.key");
    expect(existsSync(keyFile)).toBe(true);
    expect(statSync(keyFile).mode & 0o777).toBe(0o600);

    expect((await t.api("PUT", `/api/v1/bots/${bot.id}/secrets/GITHUB_TOKEN`, { value: VALUE })).body).toMatchObject({ name: "GITHUB_TOKEN" });
    expect(t.hub.secrets.vault.get(bot.id, "GITHUB_TOKEN")).toBe(VALUE);
    const rows = all(t.hub.db, "SELECT * FROM secrets");
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows)).not.toContain(VALUE);
    expect(JSON.stringify(rows)).not.toContain(Buffer.from(VALUE).toString("base64"));

    // A row copied to another bot or name does not decrypt.
    const other = await createBot(t, { name: "Bob" });
    t.hub.db.prepare("INSERT INTO secrets (bot_id, name, ciphertext, created_at) VALUES (?, 'GITHUB_TOKEN', ?, 'x')").run(other.id, rows[0]!.ciphertext as string);
    expect(t.hub.secrets.vault.get(other.id, "GITHUB_TOKEN")).toBeNull();

    // The listing names secrets, never values; bad names are refused.
    expect((await t.api("GET", `/api/v1/bots/${bot.id}/secrets`)).body).toEqual([{ name: "GITHUB_TOKEN", createdAt: expect.any(String) }]);
    expect((await t.api("PUT", `/api/v1/bots/${bot.id}/secrets/lower_case`, { value: "x" })).status).toBe(400);
    expect((await t.api("DELETE", `/api/v1/bots/${bot.id}/secrets/GITHUB_TOKEN`)).status).toBe(204);
    expect(t.hub.secrets.vault.get(bot.id, "GITHUB_TOKEN")).toBeNull();

    // ORBIS_MASTER_KEY wins over the file and must be 64 hex characters.
    const key = "ab".repeat(32);
    expect(loadMasterKey(t.dataDir, key).toString("hex")).toBe(key);
    expect(() => loadMasterKey(t!.dataDir, "short")).toThrow(/64 hexadecimal/);
    const vault = new Vault(t.hub.db, Buffer.from(key, "hex"));
    expect(vault.decrypt("b", "N", vault.encrypt("b", "N", "v"))).toBe("v");
    expect(readFileSync(keyFile, "utf8").trim()).toMatch(/^[0-9a-f]{64}$/);
  });

  it("asks with a secret-request card, stores the answer and resumes the run; the value appears nowhere (criterion 2)", async () => {
    t = await testHub();
    const bot = await createBot(t);
    const conv = (await t.api("GET", `/api/v1/bots/${bot.id}/conversation`)).body;
    const posted = await t.api("POST", `/api/v1/conversations/${conv.id}/messages`, { text: '/tool secret.request {"name":"GITHUB_TOKEN","reason":"open the release PR"}' });
    const runId = posted.body.runs[0].id;
    let card: { id: string; card: { state: string; data: Record<string, unknown> } } | undefined;
    await until(async () => {
      card = (await t!.api("GET", `/api/v1/conversations/${conv.id}/items`)).body.find((i: { card?: { type: string } }) => i.card?.type === "secret-request");
      return card !== undefined;
    });
    expect(card!.card).toMatchObject({ state: "pending", data: { name: "GITHUB_TOKEN", reason: "open the release PR", botId: bot.id } });
    expect(t.hub.repos.runs.get(runId)!.status).toBe("waiting");
    expect(t.hub.botService.get(bot.id).state).toBe("waiting");

    const answered = await t.api("POST", `/api/v1/cards/${card!.id}/secret`, { value: VALUE });
    expect(answered.status).toBe(200);
    expect(answered.body.card.state).toBe("fulfilled");
    const run = await t.hub.engine.wait(runId);
    expect(run.status).toBe("done");
    expect(run.steps.find((s) => s.type === "tool_result")!.output).toBe("the user stored GITHUB_TOKEN; use {{secret:GITHUB_TOKEN}} in the input of a tool that acts — you will never see the value");
    expect(t.hub.secrets.vault.get(bot.id, "GITHUB_TOKEN")).toBe(VALUE);
    expect((await t.api("POST", `/api/v1/cards/${card!.id}/secret`, { value: "again" })).status).toBe(409);

    // Nothing the API returns, and no event, carries the value.
    const everything = JSON.stringify([
      answered.body,
      (await t.api("GET", `/api/v1/conversations/${conv.id}/items`)).body,
      (await t.api("GET", `/api/v1/runs/${runId}`)).body,
      (await t.api("GET", `/api/v1/bots/${bot.id}/secrets`)).body,
      t.events,
    ]);
    expect(everything).not.toContain(VALUE);

    // Declining resumes the run with "unavailable".
    const second = await t.api("POST", `/api/v1/conversations/${conv.id}/messages`, { text: '/tool secret.request {"name":"NPM_TOKEN","reason":"publish"}' });
    let pending: { id: string } | undefined;
    await until(async () => {
      pending = (await t!.api("GET", `/api/v1/conversations/${conv.id}/items`)).body.find(
        (i: { card?: { type: string; state: string } }) => i.card?.type === "secret-request" && i.card.state === "pending",
      );
      return pending !== undefined;
    });
    expect((await t.api("POST", `/api/v1/cards/${pending!.id}/secret`, { decline: true })).body.card.state).toBe("declined");
    const declined = await t.hub.engine.wait(second.body.runs[0].id);
    expect(declined.steps.find((s) => s.type === "tool_result")).toMatchObject({ isError: true, output: expect.stringMatching(/declined: NPM_TOKEN is unavailable/) });
  });

  it("gives a shell command the value and returns its output to the brain masked (criterion 3)", async () => {
    t = await testHub();
    const bot = await createBot(t, { policy: allowShell });
    await t.api("PUT", `/api/v1/bots/${bot.id}/secrets/API_KEY`, { value: VALUE });
    const { runs, conversation } = await chat(t, bot.id, '/tool computer.shell {"command":"printf %s {{secret:API_KEY}} > used.txt; echo token={{secret:API_KEY}}"}');
    const workspace = t.hub.computer.workspaceDir(bot.id);
    expect(readFileSync(path.join(workspace, "used.txt"), "utf8")).toBe(VALUE); // the command got the value
    const call = runs[0].steps.find((s: { type: string }) => s.type === "tool_call");
    const result = runs[0].steps.find((s: { type: string }) => s.type === "tool_result");
    expect(call.input.command).toContain("{{secret:API_KEY}}"); // the brain's input stays a placeholder
    expect(result.output).toBe("exit code: 0\ntoken=••••");
    expect(runs[0].reply).toContain("token=••••");
    const all_ = JSON.stringify([(await t.api("GET", `/api/v1/conversations/${conversation.id}/items`)).body, runs, t.events]);
    expect(all_).not.toContain(VALUE);

    // Tools that only post inside Orbis never receive values: the placeholder stays text.
    const posted = await chat(t, bot.id, '/tool conversation.post {"text":"key is {{secret:API_KEY}}"}');
    const items = (await t.api("GET", `/api/v1/conversations/${posted.conversation.id}/items`)).body;
    expect(items.some((i: { text: string }) => i.text === "key is {{secret:API_KEY}}")).toBe(true);
  });

  it("never resolves a placeholder against another bot's vault (criterion 4)", async () => {
    t = await testHub();
    const ana = await createBot(t, { name: "Ana", policy: allowShell });
    const bob = await createBot(t, { name: "Bob" });
    await t.api("PUT", `/api/v1/bots/${bob.id}/secrets/BOB_ONLY`, { value: VALUE });
    const { runs } = await chat(t, ana.id, '/tool computer.shell {"command":"echo {{secret:BOB_ONLY}} > leak.txt"}');
    const result = runs[0].steps.find((s: { type: string }) => s.type === "tool_result");
    expect(result).toMatchObject({ isError: true, output: expect.stringMatching(/^\{\{secret:BOB_ONLY\}\} is not set for @ana: ask the user with secret.request/) });
    expect(existsSync(path.join(t.hub.computer.workspaceDir(ana.id), "leak.txt"))).toBe(false); // nothing ran
  });
});
