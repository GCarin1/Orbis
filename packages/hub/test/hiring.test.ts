// specs/hiring — rounds of short résumés written by a recruiter bot's brain (for a project's scope or one of
// the user's groups), more of them without repeats, dismissing, and hiring one: only then the full profile,
// which becomes a bot with its instructions, tools, skills, brain and key, group, manager and first message.
import { afterEach, describe, expect, it } from "vitest";
import type { Bot, HiringRound, StreamEvent, UsageReport } from "@orbis/shared";
import type { BrainAdapter, BrainEvent, BrainInput } from "../src/brains/types.js";
import { allowlistFor, candidatesTask, parseCandidates, parsePersona, personaTask, skillDocument, skillName, type WorkContext } from "../src/hiring/prompt.js";
import { parseSkill } from "../src/skills/store.js";
import { createBot, testHub, type TestHub } from "./helpers.js";

let t: TestHub | null = null;
afterEach(async () => {
  await t?.hub.hiring.wait();
  await t?.cleanup();
  t = null;
});

const line = (name: string, role: string, tools: string[] = ["web"]) =>
  JSON.stringify({ name, role, headline: `${role} who ships`, strengths: ["clear writing", "fast research", "careful"], tools });

const PROFILE = JSON.stringify({
  description: "You are Lia, the team's data analyst. You turn questions into numbers and say how sure you are.",
  responsibilities: ["Build the weekly metrics report", "Answer data questions within a day"],
  needs: ["Read access to the sales spreadsheet"],
  tools: ["web", "computer", "nope"],
  skills: [
    {
      name: "Relatório Semanal",
      description: "Builds the weekly metrics report.",
      steps: ["Collect the numbers", "Compare with last week", "Write the summary"],
    },
    { name: "!!", description: "broken", steps: ["x"] },
  ],
  intro: "Olá! Sou a Lia. Começo pelo relatório semanal.",
});

/** A recruiter brain that answers what hiring asks, and keeps every task it was given. */
function recruiterBrain(answers: { candidates?: string; profile?: string; fail?: string }) {
  const tasks: string[] = [];
  const adapter: BrainAdapter = {
    kind: "mock",
    check: () => null,
    async *run(input: BrainInput): AsyncGenerator<BrainEvent> {
      tasks.push(input.task);
      yield { type: "run.started" };
      if (answers.fail) {
        yield { type: "run.failed", error: answers.fail };
        return;
      }
      const reply = input.task.includes("full profile") ? (answers.profile ?? "") : (answers.candidates ?? "");
      yield { type: "run.usage", inputTokens: 900, outputTokens: 300, cachedTokens: 0, costUsd: 0.002, subscription: false };
      yield { type: "run.finished", reply };
    },
  };
  return { adapter, tasks };
}

async function ready(id: string): Promise<HiringRound> {
  await t!.hub.hiring.wait(id);
  return (await t!.api("GET", `/api/v1/hiring/rounds/${id}`)).body as HiringRound;
}

describe("the recruiter's prompts and answers", () => {
  const work: WorkContext = { basis: "project", brief: "A price tracker for Brazilian stocks" };
  const tools = [
    { id: "web", name: "Web", description: "fetches pages", logo: null },
    { id: "mcp.alphavantage", name: "Alpha Vantage", description: "quotes", logo: null },
  ];

  it("asks for N one-line résumés with only the tools available, in the user's language, without repeats", () => {
    const task = candidatesTask(work, tools, 20, ["Ana (QA)"], "pt-BR");
    expect(task).toContain("Propose 20 candidates");
    expect(task).toContain("A price tracker for Brazilian stocks");
    expect(task).toContain("- mcp.alphavantage: Alpha Vantage — quotes");
    expect(task).toContain("do not repeat these names or roles: Ana (QA)");
    expect(task).toContain("exactly 20 lines");
    expect(task).toContain("in Brazilian Portuguese");
  });

  it("reads lines, an array or a fenced block; skips junk and repeats; keeps only known tools; stops at the count", () => {
    const known = new Set(["web", "mcp.alphavantage"]);
    const lines = ["Here you go:", line("Lia", "Analista", ["web", "shell"]), "not json", line("Lia", "Outra"), line("Rui", "Dev"), line("Bia", "QA")].join(
      "\n",
    );
    expect(parseCandidates(lines, known, 2).map((c) => [c.name, c.tools])).toEqual([
      ["Lia", ["web"]],
      ["Rui", ["web"]],
    ]);
    expect(parseCandidates(`\`\`\`json\n[${line("Ana", "Dev")},${line("Rui", "Dev")}]\n\`\`\``, known, 5, ["ana"]).map((c) => c.name)).toEqual(["Rui"]);
    expect(parseCandidates('{"name":"","role":"x"}\n{"role":"no name"}', known, 5)).toEqual([]);
    const long = parseCandidates(JSON.stringify({ name: "Zé", role: "R", headline: "x".repeat(500), strengths: ["a", "b", "c", "d", "e", "f"] }), known, 1)[0]!;
    expect(long.headline.length).toBe(200);
    expect(long.strengths).toHaveLength(5);
    expect(long.tools).toEqual([]);
  });

  it("reads the full profile, names its skills as Orbis accepts, and turns tools into an allowlist", () => {
    const persona = parsePersona(`Sure!\n\`\`\`json\n${PROFILE}\n\`\`\``, new Set(["web", "computer"]))!;
    expect(persona.tools).toEqual(["web", "computer"]);
    expect(persona.skills.map((s) => s.name)).toEqual(["relatorio-semanal"]);
    expect(parsePersona("no json here", new Set())).toBeNull();
    expect(parsePersona('{"intro":"hi"}', new Set())).toBeNull();
    expect(skillName("Análise de Ações!")).toBe("analise-de-acoes");
    expect(parseSkill(skillDocument(persona.skills[0]!, 'Weekly report: "quoted"'))).toMatchObject({
      name: "relatorio-semanal",
      description: "Builds the weekly metrics report.",
    });
    expect(allowlistFor(["web", "mcp.alphavantage"])).toEqual(["*", "!computer.*", "!browser.*", "mcp.alphavantage.*"]);
    expect(allowlistFor([])).toEqual(["*", "!computer.*", "!browser.*", "!http.*"]);
    const profileTask = personaTask({ name: "Lia", role: "Analista", headline: "h", strengths: [], tools: ["web"] }, work, tools, "en");
    expect(profileTask).toContain("full profile");
    expect(profileTask).toContain("1 to 3 skills");
  });
});

describe("a hiring round", () => {
  it("writes short résumés for a project, counts what they cost on the recruiter, and adds more without repeats", async () => {
    t = await testHub();
    const brain = recruiterBrain({ candidates: [line("Lia", "Analista de dados"), line("Rui", "Pesquisador", ["web", "computer"])].join("\n") });
    t.hub.brains.register(brain.adapter);
    const rh = await createBot(t, { name: "Rita", role: "RH" });
    const started = await t.api("POST", "/api/v1/hiring/rounds", {
      basis: "project",
      brief: "Um painel de ações",
      recruiterId: rh.id,
      count: 2,
      lang: "pt-BR",
    });
    expect(started.status).toBe(202);
    expect(started.body).toMatchObject({ status: "generating", basis: "project", recruiterId: rh.id, requested: 2 });
    const round = await ready(started.body.id);
    expect(round.status).toBe("ready");
    expect(round.candidates.map((c) => [c.name, c.role, c.status, c.tools])).toEqual([
      ["Lia", "Analista de dados", "open", ["web"]],
      ["Rui", "Pesquisador", "open", ["web", "computer"]],
    ]);
    expect(round.usage).toEqual({ inputTokens: 900, outputTokens: 300, costUsd: 0.002 });
    expect(brain.tasks[0]).toContain("Um painel de ações");
    expect(brain.tasks[0]).toContain("Rita (RH)");
    expect(t.events.some((e) => e.type === "hiring.updated")).toBe(true);
    // The spend is the recruiter's: it shows in usage and counts toward its cap.
    const usage = (await t.api("GET", "/api/v1/usage")).body as UsageReport;
    expect(usage.bots.find((b) => b.botId === rh.id)?.usage).toMatchObject({ runs: 1, outputTokens: 300, costUsd: 0.002 });

    // More: the brain is told who is there already, and a repeated name is dropped.
    brain.adapter.run = recruiterBrain({ candidates: [line("Lia", "Repetida"), line("Bia", "Designer")].join("\n") }).adapter.run;
    const more = await ready((await t.api("POST", `/api/v1/hiring/rounds/${round.id}/more`, { count: 2 })).body.id);
    expect(more.candidates.map((c) => c.name)).toEqual(["Lia", "Rui", "Bia"]);
    expect(more.usage.outputTokens).toBe(600);

    // Dismissing and bringing back.
    const lia = more.candidates[0]!;
    expect(((await t.api("PATCH", `/api/v1/hiring/candidates/${lia.id}`, { status: "dismissed" })).body as HiringRound).candidates[0]!.status).toBe(
      "dismissed",
    );
    expect(((await t.api("PATCH", `/api/v1/hiring/candidates/${lia.id}`, { status: "open" })).body as HiringRound).candidates[0]!.status).toBe("open");

    expect((await t.api("DELETE", `/api/v1/hiring/rounds/${round.id}`)).status).toBe(204);
    expect((await t.api("GET", "/api/v1/hiring/rounds")).body).toEqual([]);
  });

  it("reads a team: its group, members and latest messages, and what the user wants more of", async () => {
    t = await testHub();
    const brain = recruiterBrain({ candidates: line("Lia", "Analista") });
    t.hub.brains.register(brain.adapter);
    const ana = await createBot(t, { name: "Ana", role: "Pesquisa" });
    const bob = await createBot(t, { name: "Bob", role: "Dev" });
    const group = (
      await t.api("POST", "/api/v1/conversations", { title: "Lançamento", members: [ana.id, bob.id], leadBotId: bob.id, description: "Lançar o app" })
    ).body;
    t.hub.timeline.post({ conversationId: group.id, kind: "message", author: { type: "user", id: null }, text: "Precisamos medir a retenção" });
    t.hub.timeline.post({ conversationId: group.id, kind: "message", author: { type: "bot", id: bob.id }, text: "Vou montar o funil" });
    const round = await ready(
      (await t.api("POST", "/api/v1/hiring/rounds", { basis: "team", groupId: group.id, brief: "alguém de dados", recruiterId: ana.id, count: 1 })).body.id,
    );
    expect(round).toMatchObject({ status: "ready", basis: "team", groupId: group.id });
    const task = brain.tasks[0]!;
    expect(task).toContain('The team (an Orbis group) "Lançamento"');
    expect(task).toContain("What it is for: Lançar o app");
    expect(task).toContain("Ana (Pesquisa), Bob (Dev)");
    expect(task).toContain("- the user: Precisamos medir a retenção");
    expect(task).toContain("- Bob: Vou montar o funil");
    expect(task).toContain("What the user wants more of in this team: alguém de dados");
  });

  it("says why a round failed, and refuses what it cannot do", async () => {
    t = await testHub();
    t.hub.brains.register(recruiterBrain({ candidates: "I would rather not." }).adapter);
    const rh = await createBot(t, { name: "Rita" });
    const failed = await ready((await t.api("POST", "/api/v1/hiring/rounds", { basis: "project", brief: "x", recruiterId: rh.id, count: 3 })).body.id);
    expect(failed).toMatchObject({ status: "failed", candidates: [] });
    expect(failed.error).toContain("Rita's brain answered no résumé in the format asked: “I would rather not.”");

    t.hub.brains.register(recruiterBrain({ fail: "quota exceeded" }).adapter);
    const broken = await ready((await t.api("POST", "/api/v1/hiring/rounds", { basis: "project", brief: "x", recruiterId: rh.id, count: 3 })).body.id);
    expect(broken.error).toBe("Rita's brain failed: quota exceeded");

    const refused = async (body: Record<string, unknown>) => (await t!.api("POST", "/api/v1/hiring/rounds", { recruiterId: rh.id, count: 3, ...body })).body;
    expect((await refused({ basis: "project" })).error.fields).toEqual({ brief: "required for a project" });
    expect((await refused({ basis: "team", groupId: "cnv_nope" })).error.fields).toEqual({ groupId: "unknown group" });
    expect((await t.api("POST", "/api/v1/hiring/rounds", { basis: "project", brief: "x", recruiterId: rh.id, count: 31 })).status).toBe(400);
    await t.api("PATCH", `/api/v1/bots/${rh.id}`, { spendCapUsd: 0 });
    const capped = await t.api("POST", "/api/v1/hiring/rounds", { basis: "project", brief: "x", recruiterId: rh.id, count: 3 });
    expect(capped.status).toBe(409);
    expect(capped.body.error.code).toBe("spend_cap_reached");
  });
});

describe("hiring a candidate", () => {
  it("writes the full profile only then, and makes it a bot: instructions, tools, skills, brain and key, group, manager, first message", async () => {
    t = await testHub();
    const brain = recruiterBrain({ candidates: [line("Lia", "Analista de dados", ["web"]), line("Rui", "Dev")].join("\n"), profile: PROFILE });
    t.hub.brains.register(brain.adapter);
    const rh = await createBot(t, { name: "Rita", role: "RH", brain: { kind: "mock", apiKeySecret: "API_KEY" } });
    await t.api("PUT", `/api/v1/bots/${rh.id}/secrets/API_KEY`, { value: "sk-test-recruiter-key-0000" });
    const lead = await createBot(t, { name: "Bob", role: "Lead" });
    const group = (await t.api("POST", "/api/v1/conversations", { title: "Dados", members: [lead.id, rh.id], leadBotId: lead.id })).body;
    const round = await ready((await t.api("POST", "/api/v1/hiring/rounds", { basis: "team", groupId: group.id, recruiterId: rh.id, count: 2 })).body.id);
    expect(brain.tasks).toHaveLength(1); // résumés only: no profile written yet

    const lia = round.candidates[0]!;
    const hiring = await t.api("POST", `/api/v1/hiring/candidates/${lia.id}/hire`, { lang: "pt-BR" });
    expect(hiring.status).toBe(202);
    expect((hiring.body as HiringRound).candidates[0]!.status).toBe("hiring");
    await t.hub.hiring.wait(lia.id);
    const after = (await t.api("GET", `/api/v1/hiring/rounds/${round.id}`)).body as HiringRound;
    const hired = after.candidates[0]!;
    expect(hired.status).toBe("hired");
    expect(brain.tasks[1]).toContain("The user is hiring Lia, Analista de dados");

    const bot = (await t.api("GET", `/api/v1/bots/${hired.botId}`)).body as Bot;
    expect(bot).toMatchObject({ name: "Lia", role: "Analista de dados", reportsTo: lead.id, brain: { kind: "mock", apiKeySecret: "API_KEY" } });
    expect(bot.description).toContain("You are Lia, the team's data analyst.");
    expect(bot.description).toContain("Responsabilidades:\n- Build the weekly metrics report");
    expect(bot.tools).toEqual(["*", "!browser.*"]);
    // The key went with the brain, never through the API.
    expect(t.hub.secrets.vault.get(bot.id, "API_KEY")).toBe("sk-test-recruiter-key-0000");
    // Its skills are its own.
    expect(t.hub.skills.store.list(bot.id).map((s) => s.name)).toEqual(["relatorio-semanal"]);
    // It joined the group, and says hello with what it will do and what it needs.
    expect(((await t.api("GET", `/api/v1/conversations/${group.id}`)).body as { members: string[] }).members).toEqual([lead.id, rh.id, bot.id]);
    const direct = (await t.api("GET", `/api/v1/bots/${bot.id}/conversation`)).body;
    const items = (await t.api("GET", `/api/v1/conversations/${direct.id}/items`)).body as Array<{ author: { id: string }; text: string }>;
    const hello = items.find((i) => i.author.id === bot.id)!;
    expect(hello.text).toContain("Olá! Sou a Lia.");
    expect(hello.text).toContain("**O que vou fazer**\n- Build the weekly metrics report");
    expect(hello.text).toContain("**Do que preciso**\n- Read access to the sales spreadsheet");

    // Hired once.
    expect((await t.api("POST", `/api/v1/hiring/candidates/${lia.id}/hire`, {})).status).toBe(409);
  });

  it("leaves the candidate open with the reason when the profile does not come", async () => {
    t = await testHub();
    t.hub.brains.register(recruiterBrain({ candidates: line("Lia", "Analista"), profile: "Sorry, no." }).adapter);
    const rh = await createBot(t, { name: "Rita" });
    const round = await ready((await t.api("POST", "/api/v1/hiring/rounds", { basis: "project", brief: "x", recruiterId: rh.id, count: 1 })).body.id);
    const before = (await t.api("GET", "/api/v1/bots")).body.length;
    await t.api("POST", `/api/v1/hiring/candidates/${round.candidates[0]!.id}/hire`, {});
    await t.hub.hiring.wait(round.candidates[0]!.id);
    const after = (await t.api("GET", `/api/v1/hiring/rounds/${round.id}`)).body as HiringRound;
    expect(after.candidates[0]).toMatchObject({ status: "open", botId: null, error: "Rita's brain answered no profile in the format asked" });
    expect((await t.api("GET", "/api/v1/bots")).body.length).toBe(before);
    const events = t.events.filter((e): e is StreamEvent<"hiring.updated"> => e.type === "hiring.updated");
    expect(events.at(-1)!.data.round.candidates[0]!.error).toContain("no profile");
  });
});
