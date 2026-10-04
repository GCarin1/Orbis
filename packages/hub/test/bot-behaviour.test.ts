// The bot behaviour audit (change 0021-bot-behaviour-audit): what bots do
// when they talk to each other, wait for the user, get stuck in a tool loop
// or hit a limit — every case found in the owner's tests, kept as regressions.
import { afterEach, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { Run, TimelineItem } from "@orbis/shared";
import { launchWithFallback } from "../src/computer/browser.js";
import { chat, createBot, testHub, type TestHub } from "./helpers.js";

let t: TestHub | null = null;
let server: Server | null = null;
afterEach(async () => {
  await t?.cleanup();
  t = null;
  await new Promise<void>((r) => (server ? server.close(() => r()) : r()));
  server = null;
});

const allRuns = (t: TestHub): Run[] => t.hub.repos.runs.list({ limit: 500 });
const timeline = async (t: TestHub, conversationId: string): Promise<TimelineItem[]> =>
  (await t.api("GET", `/api/v1/conversations/${conversationId}/items?limit=200`)).body;
const tool = (name: string, input: object) => `/tool ${name} ${JSON.stringify(input)}`;
/** Resolves with the engine idle, or rejects: a loop never lets it go idle. */
const settles = (t: TestHub, ms = 5_000) =>
  Promise.race([
    t.hub.engine.idle(),
    new Promise((_, reject) => setTimeout(() => reject(new Error(`still running after ${ms} ms: ${allRuns(t).length} runs`)), ms)),
  ]);

describe("bots talking to each other", () => {
  async function team(t: TestHub) {
    const gte = await createBot(t, { name: "Gte", role: "Gerente" });
    const anl = await createBot(t, { name: "Anl", role: "Analista" });
    const pesquisa = await createBot(t, { name: "Pesquisa", role: "Pesquisador" });
    const dev = await createBot(t, { name: "Dev", role: "Desenvolvedor" });
    const group = (await t.api("POST", "/api/v1/conversations", { title: "Equipe", members: [gte.id, anl.id, pesquisa.id, dev.id], leadBotId: gte.id })).body;
    return { gte, anl, pesquisa, dev, group };
  }
  /** The lead answers the user's message with `reply`; the user's own text mentions nobody. */
  const leadReplies = (t: TestHub, group: { id: string; leadBotId: string }, reply: string) =>
    t.hub.engine.enqueue({ botId: group.leadBotId, conversationId: group.id, trigger: { type: "message", ref: null }, input: `/reply ${reply}` });

  it("does not loop when a bot answers with a list of the team (the 'who is available?' loop)", async () => {
    t = await testHub();
    const { gte } = await team(t);
    // Outside a group, three colleagues named at once are a list: nobody is woken.
    const direct = (await t.api("GET", `/api/v1/bots/${gte.id}/conversation`)).body;
    leadReplies(t, { id: direct.id, leadBotId: gte.id }, "Disponíveis agora: @anl, @pesquisa e @dev. Como posso ajudar?");
    await settles(t);
    expect(allRuns(t)).toHaveLength(1);
    const events = (await timeline(t, direct.id)).filter((i) => i.kind === "event");
    expect(events.map((i) => i.event?.type)).toContain("mention.list");
    expect(events.find((i) => i.event?.type === "mention.list")!.text).toMatch(/named 3 bots from outside this conversation/);
  });

  it("calls every group member a representative names, each once, and they wake nobody back", async () => {
    t = await testHub();
    const { group, anl, pesquisa, dev } = await team(t);
    leadReplies(t, group, "@anl, você se apresenta para o pessoal? E @pesquisa, @dev — vocês também vêm!");
    await settles(t);
    const runs = allRuns(t).reverse();
    expect(runs.map((r) => r.trigger.type)).toEqual(["message", "mention", "mention", "mention"]);
    expect(new Set(runs.slice(1).map((r) => r.botId))).toEqual(new Set([anl.id, pesquisa.id, dev.id]));
    expect((await timeline(t, group.id)).some((i) => i.event?.type === "mention.list")).toBe(false);
  });

  it("wakes one colleague called by a reply, once, and that colleague wakes nobody back", async () => {
    t = await testHub();
    const { group, pesquisa } = await team(t);
    // Gte calls @pesquisa; Pesquisa's echoed answer names @gte back (and itself): nobody else runs.
    leadReplies(t, group, "@pesquisa, procure os preços de lápis para @gte");
    await settles(t);
    const runs = allRuns(t).reverse();
    expect(runs.map((r) => [r.trigger.type, r.botId === pesquisa.id])).toEqual([
      ["message", false],
      ["mention", true],
    ]);
    expect(new Set(runs.map((r) => r.chainId)).size).toBe(1);
  });

  it("lets every bot answer @everyone once, without them waking each other", async () => {
    t = await testHub();
    const { group } = await team(t);
    // Every echoed reply names other members.
    await t.api("POST", `/api/v1/conversations/${group.id}/messages`, { text: "@everyone digam oi para @gte e @anl" });
    await settles(t);
    expect(allRuns(t).map((r) => r.trigger.type)).toEqual(["message", "message", "message", "message"]);
  });

  it("stops one message's chain of handoffs at ORBIS_MAX_CHAIN_RUNS and says so", async () => {
    t = await testHub({ config: { maxChainRuns: 3 } });
    const chief = await createBot(t, { name: "Chief" });
    for (const name of ["Ana", "Bob", "Cid", "Dan"]) await createBot(t, { name, reportsTo: chief.id });
    const lines = ["ana", "bob", "cid", "dan"].map((h) => tool("team.handoff", { to: `@${h}`, task: `/reply ${h} done`, returnResult: false }));
    const { runs, conversation } = await chat(t, chief.id, lines.join("\n"));
    await settles(t);
    const results = runs[0].steps.filter((s: { type: string }) => s.type === "tool_result");
    expect(results.map((r: { isError: boolean }) => r.isError)).toEqual([false, false, true, true]);
    expect(allRuns(t)).toHaveLength(3);
    expect((await timeline(t, conversation.id)).some((i) => i.event?.type === "chain.limit")).toBe(true);
  });
});

describe("a run and its limits", () => {
  it("does not count the time spent waiting for the user's approval against the timeout", async () => {
    t = await testHub();
    const ana = await createBot(t, { name: "Ana", brain: { kind: "mock", timeoutSec: 1 } });
    const conv = t.hub.conversationService.directFor(ana.id);
    const posted = await t.api("POST", `/api/v1/conversations/${conv.id}/messages`, { text: tool("computer.shell", { command: "echo approved" }) });
    let pending: Array<{ id: string }> = [];
    for (let i = 0; i < 50 && pending.length === 0; i++) {
      await new Promise((r) => setTimeout(r, 50));
      pending = (await t.api("GET", "/api/v1/approvals?status=pending")).body;
    }
    // The user takes longer than the bot's whole time limit to answer.
    await new Promise((r) => setTimeout(r, 1_500));
    await t.api("POST", `/api/v1/approvals/${pending[0]!.id}`, { decision: "allow_once" });
    const run = await t.hub.engine.wait(posted.body.runs[0].id);
    expect(run.status).toBe("done");
    expect(run.steps.find((s) => s.type === "tool_result")?.output).toContain("approved");
  });

  it("refuses the third identical tool call of a run, so a stuck model stops repeating itself", async () => {
    t = await testHub();
    const ana = await createBot(t, { name: "Ana" });
    const same = tool("memory.search", { query: "preço de lápis" });
    const { runs } = await chat(t, ana.id, [same, same, same, tool("memory.search", { query: "outra coisa" })].join("\n"));
    const results = runs[0].steps.filter((s: { type: string }) => s.type === "tool_result");
    expect(results.map((r: { isError: boolean }) => r.isError)).toEqual([false, false, true, false]);
    expect(results[2].output).toMatch(/already called memory\.search with exactly this input 2 times/);
  });

  it("lets an API brain answer with what it has at the step limit, and says when its server is down", async () => {
    const bodies: Array<{ tools?: unknown[]; messages: Array<{ role: string; content: unknown }> }> = [];
    server = createServer(async (req, res) => {
      let raw = "";
      for await (const c of req) raw += c;
      const body = JSON.parse(raw);
      bodies.push(body);
      res.writeHead(200, { "content-type": "text/event-stream" });
      const send = (o: object) => res.write(`data: ${JSON.stringify(o)}\n\n`);
      if (body.tools) {
        // A model that would search forever.
        send({
          choices: [
            {
              index: 0,
              delta: {
                tool_calls: [
                  { index: 0, id: `c${bodies.length}`, function: { name: "memory_search", arguments: JSON.stringify({ query: `try ${bodies.length}` }) } },
                ],
              },
            },
          ],
        });
        send({ choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }] });
      } else {
        send({ choices: [{ index: 0, delta: { content: "Achei pouco: lápis custam de R$ 1 a R$ 5." } }] });
        send({ choices: [{ index: 0, delta: {}, finish_reason: "stop" }] });
      }
      res.end("data: [DONE]\n\n");
    });
    await new Promise<void>((r) => server!.listen(0, "127.0.0.1", () => r()));
    const url = `http://127.0.0.1:${(server!.address() as AddressInfo).port}/v1`;
    t = await testHub();
    const ana = await createBot(t, { name: "Ana", brain: { kind: "lmstudio", model: "local", baseUrl: url, maxSteps: 3 } });
    const { runs } = await chat(t, ana.id, "pesquise preços de lápis");
    expect(runs[0]).toMatchObject({ status: "done", reply: "Achei pouco: lápis custam de R$ 1 a R$ 5." });
    expect(bodies).toHaveLength(3);
    expect(bodies[2]!.tools).toBeUndefined();
    expect(JSON.stringify(bodies[2]!.messages.at(-1))).toMatch(/Do not call tools any more/);

    // A port nothing listens on any more: the LM Studio server is closed.
    const closed = createServer();
    await new Promise<void>((r) => closed.listen(0, "127.0.0.1", () => r()));
    const port = (closed.address() as AddressInfo).port;
    await new Promise<void>((r) => closed.close(() => r()));
    await t.api("PATCH", `/api/v1/bots/${ana.id}`, { brain: { kind: "lmstudio", model: "local", baseUrl: `http://127.0.0.1:${port}/v1` } });
    const down = await chat(t, ana.id, "oi");
    expect(down.runs[0].error).toBe(`could not reach http://127.0.0.1:${port}/v1 (ECONNREFUSED): is the LM Studio server running and the address right?`);
  });

  it("tells the user how to fix a bot whose brain is not ready", async () => {
    t = await testHub();
    const anl = await createBot(t, { name: "Anl", brain: { kind: "openai", model: "gpt-5" } });
    const { runs } = await chat(t, anl.id, "oi");
    expect(runs[0].error).toMatch(/no API key .* — open Anl's settings \(⚙\) to fix its brain$/);
  });
});

describe("what a bot knows and can do", () => {
  it("knows its operating system and which shell its commands run in", async () => {
    t = await testHub();
    const ana = t.hub.botService.get((await createBot(t, { name: "Ana" })).id);
    expect(t.hub.computer.contextSection(ana, "win32")).toMatch(/\(Windows\).*cmd\.exe commands \(dir, type/);
    expect(t.hub.computer.contextSection(ana, "linux")).toMatch(/\(Linux\).*\/bin\/sh/);
  });

  it("writes a skill for a colleague with skills.create, after the user approves", async () => {
    t = await testHub();
    const gte = await createBot(t, { name: "Gte", policy: { rules: [{ tool: "skills.create", decision: "allow" }], grants: [] } });
    const pesquisa = await createBot(t, { name: "Pesquisa" });
    expect(t.hub.tools.get("skills.create")!.defaultDecision).toBe("ask");
    const input = {
      name: "pesquisa-academica",
      description: "Pesquisa acadêmica sobre programação",
      when: "artigos e revisões",
      instructions: "1. Busque no Google Scholar e no arXiv.\n2. Cite cada fonte.",
      forBot: "@pesquisa",
    };
    const { runs } = await chat(t, gte.id, tool("skills.create", input));
    expect(runs[0].steps.find((s: { type: string }) => s.type === "tool_result").output).toBe(
      "created the skill pesquisa-academica for @pesquisa; it is offered to that bot from now on (/pesquisa-academica)",
    );
    const offered = (await t.api("GET", `/api/v1/skills?botId=${pesquisa.id}&offered=true`)).body as Array<{ name: string; description: string }>;
    expect(offered).toContainEqual(expect.objectContaining({ name: "pesquisa-academica", description: "Pesquisa acadêmica sobre programação" }));
    const again = await chat(t, gte.id, tool("skills.create", input));
    expect(again.runs[0].steps.find((s: { type: string }) => s.type === "tool_result").output).toMatch(/already has a skill .*replace/);
  });

  it("lists the team without @, so a bot telling the user who is busy does not wake everyone", async () => {
    t = await testHub();
    const ana = await createBot(t, { name: "Ana" });
    const { runs } = await chat(t, ana.id, tool("team.list_bots", {}));
    const output = runs[0].steps.find((s: { type: string }) => s.type === "tool_result").output as string;
    expect(output).toContain('"handle": "ana"');
    expect(output).not.toContain("@ana");
    expect(output).toContain('"busy"');
  });

  it("starts with every bot idle after a restart, whatever it was doing", async () => {
    t = await testHub();
    const ana = await createBot(t, { name: "Ana" });
    t.hub.repos.bots.setState(ana.id, "working");
    const dir = t.dataDir;
    await t.hub.close();
    t = await testHub({}, dir);
    expect(t.hub.botService.get(ana.id).state).toBe("idle");
  });

  it("opens the Chrome or Edge on the machine when Playwright's own Chromium was never downloaded", async () => {
    const tried: string[] = [];
    const browser = await launchWithFallback(async (extra) => {
      tried.push(extra.channel ?? "bundled");
      if (!extra.channel)
        throw new Error(
          "browserType.launchPersistentContext: Executable doesn't exist at C:\\Users\\Admin\\AppData\\Local\\ms-playwright\\chromium_headless_shell-1194\\chrome-win\\headless_shell.exe",
        );
      if (extra.channel === "chrome") throw new Error("Chromium distribution 'chrome' is not found");
      return "edge";
    }, null);
    expect(browser).toBe("edge");
    expect(tried).toEqual(["bundled", "chrome", "msedge"]);
    await expect(launchWithFallback(async () => Promise.reject(new Error("Executable doesn't exist at x")), null)).rejects.toThrow(
      /install Google Chrome or Microsoft Edge/,
    );
  });
});
