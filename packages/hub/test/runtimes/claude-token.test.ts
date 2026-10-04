// specs/agent-runtimes, specs/secrets — the Claude subscription's token (change 0051): the token
// `claude setup-token` prints, saved encrypted and handed to Claude Code alone as
// CLAUDE_CODE_OAUTH_TOKEN, so a hub on a server runs its claude-code bots on the plan and never
// on the API. Replayed with the fake Claude Code of contracts/cli-harnesses.
import { afterEach, describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { cleanClaudeToken, ClaudeTokenError, TOKEN_LIFETIME_DAYS } from "../../src/secrets/claude-token.js";
import { withSignInHint } from "../../src/brains/claude-code.js";
import { harnessEnv } from "../../src/brains/process.js";
import { hostEnv } from "../../src/computer/host.js";
import { chat, createBot, FIXTURES, testHub, type TestHub } from "../helpers.js";

let t: TestHub | null = null;
const savedKey = process.env.ANTHROPIC_API_KEY;
afterEach(async () => {
  await t?.cleanup();
  t = null;
  if (savedKey === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = savedKey;
});

// Made up: short enough that no scan takes them for real tokens.
const TOKEN = "sk-ant-oat01-made-up-token";
const OTHER = "sk-ant-oat01-another-one";
const fakeClaude = { kind: "claude-code", command: process.execPath, args: [path.join(FIXTURES, "fake-claude.mjs")] };

describe("the token as pasted", () => {
  it("takes the bare token, an export line, quotes and a token the terminal wrapped", () => {
    expect(cleanClaudeToken(`  ${TOKEN}\n`)).toBe(TOKEN);
    expect(cleanClaudeToken(`export CLAUDE_CODE_OAUTH_TOKEN="${TOKEN}"`)).toBe(TOKEN);
    expect(cleanClaudeToken(`CLAUDE_CODE_OAUTH_TOKEN=${TOKEN}`)).toBe(TOKEN);
    expect(cleanClaudeToken("sk-ant-oat01-made-\n  up-token")).toBe(TOKEN);
  });

  it("refuses an API key, which would bill the API, and what is not a token", () => {
    expect(() => cleanClaudeToken("sk-ant-api03-a-key-of-the-api")).toThrow(/API key.*claude setup-token/);
    expect(() => cleanClaudeToken("   ")).toThrow(ClaudeTokenError);
    expect(() => cleanClaudeToken("short")).toThrow(/does not look like/);
    expect(() => cleanClaudeToken("sk-ant-oat01-<paste here>!!")).toThrow(/does not look like/);
  });
});

describe("where the token comes from", () => {
  it("prefers the saved token to the server's, and goes back to the server's when it is removed", async () => {
    t = await testHub({ config: { claudeOauthToken: OTHER } });
    expect((await t.api("GET", "/api/v1/runtimes/claude/account")).body.token).toMatchObject({ saved: true, source: "server", savedAt: null });
    const saved = await t.api("PUT", "/api/v1/runtimes/claude/token", { token: ` ${TOKEN} ` });
    expect(saved.body).toMatchObject({ saved: true, source: "saved" });
    const days = (Date.parse(saved.body.expiresAround) - Date.parse(saved.body.savedAt)) / 86_400_000;
    expect(days).toBe(TOKEN_LIFETIME_DAYS);
    expect(JSON.stringify(saved.body)).not.toContain(TOKEN);
    expect((await t.api("DELETE", "/api/v1/runtimes/claude/token")).body).toMatchObject({ saved: true, source: "server" });
  });

  it("answers 400 for an API key and keeps none; the token stays across a restart, encrypted", async () => {
    t = await testHub();
    const refused = await t.api("PUT", "/api/v1/runtimes/claude/token", { token: "sk-ant-api03-a-key-of-the-api" });
    expect(refused.status).toBe(400);
    expect(refused.body.error.message).toMatch(/API key/);
    expect((await t.api("GET", "/api/v1/runtimes/claude/account")).body.token).toEqual({ saved: false, source: null, savedAt: null, expiresAround: null });

    await t.api("PUT", "/api/v1/runtimes/claude/token", { token: TOKEN });
    // Encrypted at rest: the database file never holds the token.
    const db = readdirSync(t.dataDir).filter((f) => f.startsWith("orbis.db"));
    expect(db).toContain("orbis.db");
    for (const file of db) expect(readFileSync(path.join(t.dataDir, file)).includes(TOKEN)).toBe(false);
    const dir = t.dataDir;
    await t.hub.close();
    t = await testHub({}, dir);
    expect((await t.api("GET", "/api/v1/runtimes/claude/account")).body.token).toMatchObject({ saved: true, source: "saved" });
  });
});

describe("a claude-code run on the subscription", () => {
  it("gives Claude Code the saved token and never an API key, and masks the token in what the run stores", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-api03-on-the-hub";
    t = await testHub({ config: { anthropicApiKey: "sk-ant-api03-on-the-hub" } });
    await t.hub.listen();
    const bot = await createBot(t, { brain: fakeClaude });
    expect((await chat(t, bot.id, "ECHO_TOKEN")).runs[0]).toMatchObject({ status: "done", reply: "token none · api key no" });

    await t.api("PUT", "/api/v1/runtimes/claude/token", { token: TOKEN });
    const run = (await chat(t, bot.id, "ECHO_TOKEN")).runs[0];
    expect(run).toMatchObject({ status: "done", reply: "token •••• · api key no" });
    const env = JSON.parse(readFileSync(path.join(t.hub.computer.workspaceDir(bot.id), "fake-claude-env.json"), "utf8")) as Record<string, string>;
    expect(env.CLAUDE_CODE_OAUTH_TOKEN).toBe(TOKEN);
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
    const timeline = JSON.stringify((await t.api("GET", `/api/v1/conversations/${run.conversationId}/items`)).body);
    expect(timeline).not.toContain(TOKEN);
  });

  it("uses a bot's own token secret over the hub's, and says a refused token needs a new one", async () => {
    t = await testHub();
    await t.hub.listen();
    await t.api("PUT", "/api/v1/runtimes/claude/token", { token: TOKEN });
    const bot = await createBot(t, { brain: fakeClaude });
    await t.api("PUT", `/api/v1/bots/${bot.id}/secrets/CLAUDE_CODE_OAUTH_TOKEN`, { value: OTHER });
    await chat(t, bot.id, "ECHO_TOKEN");
    const env = JSON.parse(readFileSync(path.join(t.hub.computer.workspaceDir(bot.id), "fake-claude-env.json"), "utf8")) as Record<string, string>;
    expect(env.CLAUDE_CODE_OAUTH_TOKEN).toBe(OTHER);

    const failed = (await chat(t, bot.id, "TOKEN_REFUSED")).runs[0];
    expect(failed.status).toBe("failed");
    expect(failed.error).toContain("claude setup-token");
    expect(failed.error).not.toContain("claude auth login");
  });

  it("tests the brain on its own with the hub's token", async () => {
    t = await testHub();
    const brain = { ...fakeClaude, args: [...fakeClaude.args, "--token-seen"] };
    expect((await t.api("POST", "/api/v1/runtimes/test", { brain })).body).toMatchObject({ ok: true, answered: true, reply: "391 · token none" });
    await t.api("PUT", "/api/v1/runtimes/claude/token", { token: TOKEN });
    expect((await t.api("POST", "/api/v1/runtimes/test", { brain })).body).toMatchObject({ ok: true, reply: "391 · token given" });
  });
});

describe("the token reaches Claude Code alone", () => {
  it("is not passed to the other brains nor to commands on the user's computer, nor are API keys", () => {
    const hub = { PATH: "/usr/bin", HOME: "/home/me", CLAUDE_CODE_OAUTH_TOKEN: TOKEN, ANTHROPIC_API_KEY: "k", ANTHROPIC_AUTH_TOKEN: "k" };
    expect(harnessEnv({}, hub)).toEqual({ PATH: "/usr/bin", HOME: "/home/me" });
    const host = hostEnv(hub);
    expect(host.CLAUDE_CODE_OAUTH_TOKEN).toBeUndefined();
    expect(host.ANTHROPIC_AUTH_TOKEN).toBeUndefined();
    expect(host.PATH).toBe("/usr/bin");
  });

  it("says how to get a new token when the token is refused, and how to sign in otherwise", () => {
    const refused = "Failed to authenticate. API Error: 401 OAuth token has expired";
    expect(withSignInHint(refused, true)).toContain('make a new one with "claude setup-token" (on the phone: orbis-phone setup-token)');
    expect(withSignInHint(refused, false)).toContain("claude auth login");
    expect(withSignInHint(withSignInHint(refused, true), true)).toBe(withSignInHint(refused, true));
  });
});
