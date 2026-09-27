import { afterEach, describe, expect, it } from "vitest";
import { runCli, startTestHub } from "./helpers.js";

let hub: Awaited<ReturnType<typeof startTestHub>> | null = null;
afterEach(async () => {
  await hub?.cleanup();
  hub = null;
});

describe("orbis runtimes check", () => {
  it("lists the subscription CLIs and whether each is installed", async () => {
    hub = await startTestHub();
    const res = await runCli(["runtimes", "check", "--json"], hub.env);
    expect(res.code).toBe(0);
    expect(JSON.parse(res.stdout).map((h: { kind: string }) => h.kind)).toEqual(["claude-code", "codex", "gemini-cli"]);
    const text = await runCli(["runtimes"], hub.env);
    expect(text.stdout).toMatch(/claude-code/);
    expect(text.stdout).toMatch(/API brains \(anthropic, openai\)/);
  });
});
