// The desktop app's settings file.
import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadSettings, saveSettings } from "../src/settings.js";

describe("desktop settings", () => {
  it("defaults to the local hub, keeps a saved URL and ignores a broken file", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "orbis-settings-"));
    try {
      const file = path.join(dir, "nested", "settings.json");
      expect(loadSettings(file)).toEqual({ hubUrl: "http://127.0.0.1:7420" });
      saveSettings(file, { hubUrl: "http://192.168.0.10:7420" });
      expect(loadSettings(file)).toEqual({ hubUrl: "http://192.168.0.10:7420" });
      expect(() => saveSettings(file, { hubUrl: "ftp://x" })).toThrow(/http/);
      writeFileSync(file, "{not json");
      expect(loadSettings(file).hubUrl).toBe("http://127.0.0.1:7420");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
