// specs/cli — `orbis runtimes check` and `orbis runtimes test`.
import { afterEach, describe, expect, it } from "vitest";
import { runCli, startTestHub } from "./helpers.js";

let hub: Awaited<ReturnType<typeof startTestHub>> | null = null;
afterEach(async () => {
  await hub?.cleanup();
  hub = null;
});

describe("orbis runtimes", () => {
  it("check lists the subscription CLIs and the local model servers", async () => {
    hub = await startTestHub();
    const res = await runCli(["runtimes", "check", "--json"], hub.env);
    expect(res.code).toBe(0);
    const body = JSON.parse(res.stdout);
    expect(body.cli.map((h: { kind: string }) => h.kind)).toEqual(["claude-code", "codex", "gemini-cli", "cursor"]);
    expect(body.local.map((s: { kind: string }) => s.kind)).toEqual(["ollama", "lmstudio"]);
    const text = await runCli(["runtimes"], hub.env);
    expect(text.stdout).toMatch(/Subscription CLIs \(your own login, no API key\)/);
    expect(text.stdout).toMatch(/cursor/);
    expect(text.stdout).toMatch(/Local model servers \(no key\)/);
    expect(text.stdout).toMatch(/ollama/);
  });

  it("test asks a brain the test question and says whether a model answered", async () => {
    hub = await startTestHub();
    await runCli(["bots", "create", "--name", "Echo", "--brain", "mock"], hub.env);
    const byBot = await runCli(["runtimes", "test", "@echo"], hub.env);
    expect(byBot.code).toBe(0);
    expect(byBot.stdout).toMatch(/Asking @echo: "What is 17 × 23\? Answer with the number only\."/);
    expect(byBot.stdout).toMatch(/✓ mock answered in [\d.]+s: \[Echo\] What is 17 × 23\?/);
    expect(byBot.stdout).toMatch(/no model answered \(the mock brain only echoes\)/);

    const missing = await runCli(["runtimes", "test", "ollama", "--json"], hub.env);
    expect(missing.code).toBe(1);
    expect(JSON.parse(missing.stdout)).toMatchObject({ kind: "ollama", ok: false, error: expect.stringMatching(/no model configured/) });

    const unknown = await runCli(["runtimes", "test", "gpt"], hub.env);
    expect(unknown.code).not.toBe(0);
    expect(unknown.stderr).toMatch(/unknown brain "gpt"/);
  });
});
