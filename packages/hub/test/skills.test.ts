// specs/skills — acceptance criteria 1, 2 and 3.
import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { BrainAdapter, BrainInput } from "../src/brains/types.js";
import { parseSkill } from "../src/skills/store.js";
import { chat, createBot, testHub, type TestHub } from "./helpers.js";

let t: TestHub | null = null;
afterEach(async () => {
  await t?.cleanup();
  t = null;
});

const skill = (name: string, description: string, body = `Steps for ${name}.`) => `---\nname: ${name}\ndescription: ${description}\n---\n${body}\n`;

/** A brain that records what it was given and answers at once. */
function capture(): { adapter: BrainAdapter; inputs: BrainInput[] } {
  const inputs: BrainInput[] = [];
  const adapter: BrainAdapter = {
    kind: "mock",
    check: () => null,
    async *run(input) {
      inputs.push(input);
      yield { type: "run.started" };
      yield { type: "run.finished", reply: `ran ${input.skill?.name ?? "no skill"}` };
    },
  };
  return { adapter, inputs };
}

describe("skills", () => {
  it("creates, lists, edits and deletes skills at account and bot scope; a bad name or no description answers 400 (criterion 1)", async () => {
    t = await testHub();
    const bot = await createBot(t);
    const created = await t.api("POST", "/api/v1/skills", { content: skill("release-notes", "Write the release notes") });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ name: "release-notes", description: "Write the release notes", scope: "account", botId: null, body: "Steps for release-notes." });
    expect(existsSync(path.join(t.dataDir, "skills", "release-notes", "SKILL.md"))).toBe(true);
    const own = await t.api("POST", "/api/v1/skills", { content: skill("triage", "Triage a bug report"), botId: "@ana".slice(1) });
    expect(own.body).toMatchObject({ scope: "bot", botId: bot.id });
    expect(existsSync(path.join(t.dataDir, "bots", bot.id, "skills", "triage", "SKILL.md"))).toBe(true);

    expect((await t.api("GET", "/api/v1/skills")).body.map((s: { name: string }) => s.name)).toEqual(["release-notes"]);
    expect((await t.api("GET", `/api/v1/skills?botId=${bot.id}`)).body.map((s: { name: string }) => s.name)).toEqual(["triage"]);
    expect((await t.api("GET", `/api/v1/skills?botId=${bot.id}&offered=true`)).body.map((s: { name: string }) => s.name)).toEqual(["release-notes", "triage"]);
    expect((await t.api("POST", "/api/v1/skills", { content: skill("release-notes", "again") })).status).toBe(409);

    const edited = await t.api("PUT", "/api/v1/skills/release-notes", { content: skill("release-notes", "Write short release notes", "New steps.") });
    expect(edited.body).toMatchObject({ description: "Write short release notes", body: "New steps." });
    expect((await t.api("GET", "/api/v1/skills/release-notes")).body.content).toContain("New steps.");
    expect((await t.api("PUT", "/api/v1/skills/release-notes", { content: skill("renamed", "x") })).status).toBe(400);

    const badName = await t.api("POST", "/api/v1/skills", { content: skill("Bad Name!", "x") });
    expect(badName.status).toBe(400);
    expect(badName.body.error.fields.name).toMatch(/a-z, 0-9 and -/);
    const noDescription = await t.api("POST", "/api/v1/skills", { content: "---\nname: quiet\n---\nbody\n" });
    expect(noDescription.status).toBe(400);
    expect(noDescription.body.error.fields.description).toBe("is required");
    expect((await t.api("POST", "/api/v1/skills", { content: "just text" })).status).toBe(400);

    expect((await t.api("DELETE", `/api/v1/skills/triage?botId=${bot.id}`)).status).toBe(204);
    expect((await t.api("GET", `/api/v1/skills/triage?botId=${bot.id}`)).status).toBe(404);
    expect((await t.api("DELETE", "/api/v1/skills/release-notes")).status).toBe(204);
    expect((await t.api("GET", "/api/v1/skills")).body).toEqual([]);
  });

  it("parses frontmatter with an optional when, and skips an invalid file edited by hand", async () => {
    expect(parseSkill("---\nname: a-b\ndescription: Does A\nwhen: after a deploy\n---\n\nBody\n")).toEqual({ name: "a-b", description: "Does A", when: "after a deploy", body: "Body" });
    t = await testHub();
    mkdirSync(path.join(t.dataDir, "skills", "broken"), { recursive: true });
    writeFileSync(path.join(t.dataDir, "skills", "broken", "SKILL.md"), "no frontmatter");
    await t.api("POST", "/api/v1/skills", { content: skill("fine", "Works") });
    expect((await t.api("GET", "/api/v1/skills")).body.map((s: { name: string }) => s.name)).toEqual(["fine"]);
  });

  it("runs /<skill> input with the skill body as instructions and the rest as input (criterion 2)", async () => {
    const { adapter, inputs } = capture();
    t = await testHub({ brains: [adapter] });
    const bot = await createBot(t);
    await t.api("POST", "/api/v1/skills", { content: skill("release-notes", "Write the release notes", "1. Read the merged PRs.\n2. Group them by area.") });
    const { runs } = await chat(t, bot.id, "/release-notes for version 4.2");
    expect(runs[0]).toMatchObject({ status: "done", skill: "release-notes", reply: "ran release-notes" });
    expect(inputs[0]!.skill).toEqual({ name: "release-notes", body: "1. Read the merged PRs.\n2. Group them by area." });
    expect(inputs[0]!.task).toBe("for version 4.2");
    // Every run lists the offered skills in its system text.
    expect(inputs[0]!.context.identity).toContain("Skills you can use");
    expect(inputs[0]!.context.identity).toContain("- release-notes: Write the release notes");

    // A slash word that is no skill anywhere passes through as text.
    await chat(t, bot.id, "/deploy now");
    expect(inputs[1]).toMatchObject({ skill: null, task: "/deploy now" });
    // A mention before the slash still invokes the skill (groups).
    await chat(t, bot.id, "@ana /release-notes");
    expect(inputs[2]).toMatchObject({ skill: { name: "release-notes" }, task: "Run the skill /release-notes." });
  });

  it("offers skills.list and skills.read over the bot's offered skills only", async () => {
    t = await testHub();
    await t.api("POST", "/api/v1/skills", { content: skill("release-notes", "Write the release notes", "The steps.") });
    await t.api("POST", "/api/v1/skills", { content: skill("payroll", "Run payroll") });
    const bot = await createBot(t, { skills: ["release-*"] });
    const { runs } = await chat(t, bot.id, '/tool skills.list {}\n/tool skills.read {"name":"release-notes"}\n/tool skills.read {"name":"payroll"}');
    const results = runs[0].steps.filter((s: { type: string }) => s.type === "tool_result");
    expect(results[0].output).toBe("release-notes (account): Write the release notes");
    expect(results[1].output).toBe("# release-notes\nWrite the release notes\n\nThe steps.");
    expect(results[2]).toMatchObject({ isError: true, output: expect.stringMatching(/no skill "payroll" is offered to you/) });
  });

  it("does not offer a skill outside the bot's allowlist, and its invocation posts an event and starts nothing (criterion 3)", async () => {
    t = await testHub();
    await t.api("POST", "/api/v1/skills", { content: skill("payroll", "Run payroll") });
    const bot = await createBot(t, { skills: ["release-*"] });
    const other = await createBot(t, { name: "Bob" });
    await t.api("POST", "/api/v1/skills", { content: skill("bob-only", "Bob's skill"), botId: other.id });

    expect((await t.api("GET", `/api/v1/skills?botId=${bot.id}&offered=true`)).body).toEqual([]);
    for (const text of ["/payroll for September", "/bob-only"]) {
      const { runs, conversation } = await chat(t, bot.id, text);
      expect(runs).toEqual([]);
      const items = (await t.api("GET", `/api/v1/conversations/${conversation.id}/items`)).body;
      const event = items.at(-1);
      expect(event).toMatchObject({ kind: "event", event: { type: "skill.unavailable", data: { botId: bot.id } } });
      expect(event.text).toMatch(/@ana is not offered the skill \/(payroll|bob-only), so it did not run\./);
    }
  });
});
