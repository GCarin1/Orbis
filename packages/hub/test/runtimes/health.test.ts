// specs/agent-runtimes — acceptance criterion 8 (brain health check).
import { afterEach, describe, expect, it } from "vitest";
import { copyFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { runtimeHealth } from "../../src/brains/health.js";
import { FIXTURES, testHub, type TestHub } from "../helpers.js";

let t: TestHub | null = null;
afterEach(async () => {
  await t?.cleanup();
  t = null;
});

describe("runtimes health", () => {
  it("reports found executables with their version and missing ones (criterion 8)", async () => {
    const bin = mkdtempSync(path.join(tmpdir(), "orbis-bin-"));
    copyFileSync(path.join(FIXTURES, "fake-version.mjs"), path.join(bin, "claude"));
    const { chmodSync } = await import("node:fs");
    chmodSync(path.join(bin, "claude"), 0o755);
    const health = await runtimeHealth(undefined, `${bin}${path.delimiter}${path.dirname(process.execPath)}`);
    expect(health).toEqual([
      { kind: "claude-code", executable: "claude", found: true, path: path.join(bin, "claude"), version: "9.9.9 (fake)" },
      { kind: "codex", executable: "codex", found: false, path: null, version: null },
      { kind: "gemini-cli", executable: "gemini", found: false, path: null, version: null },
      { kind: "cursor", executable: "cursor-agent", found: false, path: null, version: null },
    ]);
  });

  it("is served at /api/v1/runtimes/health", async () => {
    t = await testHub();
    const res = await t.api("GET", "/api/v1/runtimes/health");
    expect(res.status).toBe(200);
    expect(res.body.map((h: { kind: string }) => h.kind)).toEqual(["claude-code", "codex", "gemini-cli", "cursor"]);
  });
});
