// specs/memory — acceptance criteria 1, 2 and 4.
import { afterEach, describe, expect, it } from "vitest";
import { chat, createBot, testHub, type TestHub } from "./helpers.js";

let t: TestHub | null = null;
afterEach(async () => {
  await t?.cleanup();
  t = null;
});

const toolResult = (run: { steps: Array<{ type: string; output?: string }> }, n = 0) => run.steps.filter((s) => s.type === "tool_result")[n]!.output!;
// Search hits other than run summaries (earlier search runs leave summaries that quote their results).
const facts = (output: string): Array<{ kind: string; scope: string; text: string }> =>
  output === "nothing found" ? [] : JSON.parse(output).filter((m: { kind: string }) => m.kind !== "summary");

describe("memory", () => {
  it("saves, finds, shares team entries, and reflects edits and deletes at once (criterion 1)", async () => {
    t = await testHub();
    const ana = await createBot(t, { name: "Ana" });
    const bob = await createBot(t, { name: "Bob" });
    const saved = await chat(t, ana.id, '/tool memory.save {"text":"The user prefers reports in Portuguese","kind":"preference"}');
    expect(toolResult(saved.runs[0])).toMatch(/^saved preference mem_/);
    await chat(t, ana.id, '/tool memory.save {"text":"Staging lives at staging.acme.test","scope":"team"}');

    const found = await chat(t, ana.id, '/tool memory.search {"query":"portuguese reports"}');
    expect(JSON.parse(toolResult(found.runs[0]))[0]).toMatchObject({ kind: "preference", scope: "bot", text: "The user prefers reports in Portuguese" });
    const bobFinds = await chat(t, bob.id, '/tool memory.search {"query":"staging"}');
    expect(JSON.parse(toolResult(bobFinds.runs[0]))[0]).toMatchObject({ scope: "team", text: "Staging lives at staging.acme.test" });

    const team = (await t.api("GET", "/api/v1/memory?scope=team")).body;
    expect(team).toHaveLength(1);
    const edited = await t.api("PATCH", `/api/v1/memory/${team[0].id}`, { text: "Staging moved to qa.acme.test" });
    expect(edited.body.text).toBe("Staging moved to qa.acme.test");
    // "lives" was only in the old text: the index follows the edit.
    expect(facts(toolResult((await chat(t, bob.id, '/tool memory.search {"query":"lives"}')).runs[0]))).toEqual([]);
    expect(facts(toolResult((await chat(t, bob.id, '/tool memory.search {"query":"moved"}')).runs[0]))[0]!.text).toBe("Staging moved to qa.acme.test");
    expect((await t.api("DELETE", `/api/v1/memory/${team[0].id}`)).status).toBe(204);
    expect(facts(toolResult((await chat(t, bob.id, '/tool memory.search {"query":"moved"}')).runs[0]))).toEqual([]);

    const added = await t.api("POST", `/api/v1/bots/${ana.id}/memory`, { kind: "role", text: "Owns the release checklist" });
    expect(added.status).toBe(201);
    expect((await t.api("GET", `/api/v1/bots/${ana.id}/memory`)).body.some((m: { text: string }) => m.text === "Owns the release checklist")).toBe(true);
  });

  it("never returns one bot's own entries to another bot (criterion 2)", async () => {
    t = await testHub();
    const ana = await createBot(t, { name: "Ana" });
    const bob = await createBot(t, { name: "Bob" });
    await t.api("POST", `/api/v1/bots/${ana.id}/memory`, { kind: "fact", text: "Ana's private budget note: 1234" });
    const bobSearch = await chat(t, bob.id, '/tool memory.search {"query":"budget note"}');
    expect(toolResult(bobSearch.runs[0])).toBe("nothing found");
    const anaSearch = await chat(t, ana.id, '/tool memory.search {"query":"budget note"}');
    expect(toolResult(anaSearch.runs[0])).toContain("1234");
  });

  it("stores a summary with the task and the start of the reply after a successful run (criterion 4)", async () => {
    t = await testHub();
    const ana = await createBot(t, { name: "Ana" });
    const long = "x".repeat(900);
    await chat(t, ana.id, `/reply ${long}`);
    const summaries = t.hub.repos.memory.list(ana.id).filter((m) => m.kind === "summary");
    expect(summaries).toHaveLength(1);
    expect(summaries[0]!.text).toBe(`Task: /reply ${long.slice(0, 293)}…\nResult: ${long.slice(0, 500)}`);
    await chat(t, ana.id, "/fail broken");
    expect(t.hub.repos.memory.list(ana.id).filter((m) => m.kind === "summary")).toHaveLength(1);
  });
});
