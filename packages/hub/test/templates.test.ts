// specs/templates — acceptance criteria 1 to 3.
import { afterEach, describe, expect, it } from "vitest";
import { parse } from "yaml";
import { scanForSecrets } from "../src/templates/service.js";
import { chat, createBot, testHub, type TestHub } from "./helpers.js";

let t: TestHub | null = null;
afterEach(async () => {
  await t?.cleanup();
  t = null;
});

const skill = (name: string, description: string) => `---\nname: ${name}\ndescription: ${description}\n---\nSteps for ${name}.\n`;

async function richBot(t: TestHub) {
  const bot = await createBot(t, {
    name: "Ana",
    role: "QA",
    description: "You are the QA analyst. Never send anything without my approval.",
    brain: { kind: "anthropic", model: "claude-opus-5", apiKeySecret: "ANTHROPIC_KEY" },
    policy: { rules: [{ tool: "computer.shell", decision: "ask", locked: true }], grants: ["http.fetch"] },
    computer: { enabled: true, provider: "local", hibernateAfterMin: 10 },
    tools: ["computer.*", "http.fetch"],
    skills: ["release-*"],
    spendCapUsd: 20,
  });
  await t.api("POST", "/api/v1/skills", { content: skill("triage", "Triage a bug report"), botId: bot.id });
  const routine = (await t.api("POST", `/api/v1/bots/${bot.id}/routines`, { name: "Daily QA", trigger: { type: "cron", cron: "0 9 * * 1-5", timezone: "America/Sao_Paulo" }, instruction: "Run the smoke checklist" })).body;
  await t.api("POST", `/api/v1/routines/${routine.id}/enable`, { force: true });
  return bot;
}

describe("templates", () => {
  it("exports a bot and imports it as a new bot with the same identity, brain, policy, skills and routines, every routine disabled (criterion 1)", async () => {
    t = await testHub();
    const ana = await richBot(t);
    const exported = await t.api("GET", `/api/v1/bots/${ana.id}/export`);
    expect(exported.status).toBe(200);
    expect(String(exported.headers["content-type"])).toMatch(/^text\/yaml/);
    expect(exported.headers["content-disposition"]).toBe('attachment; filename="ana.orbis.yaml"');
    const doc = parse(exported.body);
    expect(doc).toMatchObject({ apiVersion: "orbis/v1", kind: "BotTemplate", metadata: { name: "Ana", role: "QA" } });

    const imported = await t.api("POST", "/api/v1/bots/import", { yaml: exported.body });
    expect(imported.status).toBe(201);
    const copy = imported.body;
    expect(copy.id).not.toBe(ana.id);
    expect(copy.handle).toBe("ana-2");
    expect(copy).toMatchObject({
      name: "Ana",
      role: "QA",
      description: ana.description,
      avatar: { color: ana.avatar.color },
      brain: { kind: "anthropic", model: "claude-opus-5" },
      policy: ana.policy,
      computer: ana.computer,
      tools: ana.tools,
      skills: ana.skills,
      spendCapUsd: 20,
    });
    expect(copy.brain.apiKeySecret).toBeUndefined();
    expect((await t.api("GET", `/api/v1/skills?botId=${copy.id}`)).body.map((s: { name: string }) => s.name)).toEqual(["triage"]);
    const routines = (await t.api("GET", `/api/v1/bots/${copy.id}/routines`)).body;
    expect(routines).toEqual([expect.objectContaining({ name: "Daily QA", trigger: { type: "cron", cron: "0 9 * * 1-5", timezone: "America/Sao_Paulo" }, enabled: false })]);
  });

  it("refuses to export a bot whose description holds a GitHub token, naming the line (criterion 2)", async () => {
    t = await testHub();
    const bot = await createBot(t, { description: "Deploy with the token below.\ntoken ghp_0123456789abcdefghijklmnopqrstuvwxyzAB\nThanks." });
    const res = await t.api("GET", `/api/v1/bots/${bot.id}/export`);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("secrets_found");
    const line = Object.keys(res.body.error.fields)[0]!;
    expect(line).toMatch(/^line \d+$/);
    expect(res.body.error.fields[line]).toBe("GitHub token");
    expect(JSON.stringify(res.body)).not.toContain("ghp_0123456789");
    // The same credential in a routine instruction is caught too.
    const clean = await createBot(t, { name: "Bob" });
    await t.api("POST", `/api/v1/bots/${clean.id}/routines`, { name: "x", trigger: { type: "webhook" }, instruction: "curl -H 'Authorization: sk-ant-api03-abcdefghijklmnopqrstuvwxyz'" });
    expect((await t.api("GET", `/api/v1/bots/${clean.id}/export`)).body.error.fields).toEqual(expect.objectContaining({}));
    expect((await t.api("GET", `/api/v1/bots/${clean.id}/export`)).status).toBe(422);
  });

  it("puts no memory, history, secrets or computer state in the document (criterion 3)", async () => {
    t = await testHub();
    const ana = await richBot(t);
    await t.api("PUT", `/api/v1/bots/${ana.id}/secrets/ANTHROPIC_KEY`, { value: "vault-value-never-exported" });
    await t.api("POST", `/api/v1/bots/${ana.id}/memory`, { kind: "fact", text: "memory-entry-never-exported" });
    await chat(t, ana.id, "/tool computer.write_file {\"path\":\"note.txt\",\"content\":\"workspace-file-never-exported\"}");
    await chat(t, ana.id, "conversation-history-never-exported");
    const text = (await t.api("GET", `/api/v1/bots/${ana.id}/export`)).body as string;
    for (const leak of ["vault-value-never-exported", "ANTHROPIC_KEY", "memory-entry-never-exported", "workspace-file-never-exported", "conversation-history-never-exported", "apiKeySecret", ana.id]) {
      expect(text).not.toContain(leak);
    }
    expect(Object.keys(parse(text).spec).sort()).toEqual(["brain", "capIncludesSubscription", "computer", "ownSkills", "policy", "routines", "skills", "spendCapUsd", "tools"]);
  });

  it("rejects a template with another apiVersion or kind, naming the field, and invalid content", async () => {
    t = await testHub();
    const bad = async (yaml: string) => (await t!.api("POST", "/api/v1/bots/import", { yaml })).body.error;
    expect((await bad("apiVersion: orbis/v2\nkind: BotTemplate\nmetadata: {name: X}\nspec: {}\n")).fields).toEqual({ apiVersion: 'must be "orbis/v1"' });
    expect((await bad("apiVersion: orbis/v1\nkind: Robot\nmetadata: {name: X}\nspec: {}\n")).fields).toEqual({ kind: 'must be "BotTemplate"' });
    expect(Object.keys((await bad("apiVersion: orbis/v1\nkind: BotTemplate\nmetadata: {name: X}\nspec: {brain: {kind: laser}}\n")).fields)[0]).toMatch(/^spec\.brain/);
    expect((await bad(": : :")).fields.yaml ?? (await bad(": : :")).fields.apiVersion).toBeDefined();
    const broken = await bad("apiVersion: orbis/v1\nkind: BotTemplate\nmetadata: {name: X}\nspec:\n  ownSkills: ['no frontmatter']\n");
    expect(Object.keys(broken.fields)).toEqual(["spec.ownSkills.0"]);
    expect((await t.api("GET", "/api/v1/bots")).body).toEqual([]); // nothing half-created
  });

  it("scans for the credential patterns the spec names, and leaves placeholders alone", () => {
    const lines = [
      "-----BEGIN OPENSSH PRIVATE KEY-----",
      "aws: AKIAABCDEFGHIJKLMNOP",
      "slack: xoxb-1234567890-abcdefghij",
      "key: sk-proj-abcdefghijklmnopqrstuvwx",
      "password: hunter2hunter2!",
      'api_key = "0123456789abcdef"',
      "token: {{secret:GITHUB_TOKEN}}",
      "password: short",
      "description: the token rotates weekly",
    ];
    expect(scanForSecrets(lines.join("\n"))).toEqual([
      { line: 1, kind: "private key block" },
      { line: 2, kind: "AWS access key" },
      { line: 3, kind: "Slack token" },
      { line: 4, kind: "API key (sk-…)" },
      { line: 5, kind: "password, token or secret assignment" },
      { line: 6, kind: "password, token or secret assignment" },
    ]);
  });
});
