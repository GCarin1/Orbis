// specs/cli — acceptance criterion 1 (flags beat environment beat config file).
import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { resolveConnection, configFilePath, writeConfigFile, readConfigFile } from "../src/config.js";

function home(): string {
  return mkdtempSync(path.join(tmpdir(), "orbis-home-"));
}

describe("cli configuration", () => {
  it("resolves flags before environment before the config file (criterion 1)", () => {
    const HOME = home();
    writeConfigFile({ HOME }, { url: "http://file:1", token: "file-token" });

    const fromFile = resolveConnection({}, { HOME });
    expect(fromFile).toMatchObject({ url: "http://file:1", token: "file-token" });

    const fromEnv = resolveConnection({}, { HOME, ORBIS_URL: "http://env:2", ORBIS_TOKEN: "env-token" });
    expect(fromEnv).toMatchObject({ url: "http://env:2", token: "env-token", source: { url: "ORBIS_URL", token: "ORBIS_TOKEN" } });

    const fromFlags = resolveConnection({ url: "http://flag:3/", token: "flag-token" }, { HOME, ORBIS_URL: "http://env:2", ORBIS_TOKEN: "env-token" });
    expect(fromFlags).toMatchObject({ url: "http://flag:3", token: "flag-token", source: { url: "--url", token: "--token" } });

    // Each value resolves on its own: a flag URL with the file's token.
    expect(resolveConnection({ url: "http://flag:3" }, { HOME })).toMatchObject({ url: "http://flag:3", token: "file-token" });
  });

  it("falls back to the local hub's token file and the default URL", () => {
    const HOME = home();
    mkdirSync(path.join(HOME, ".orbis"), { recursive: true });
    writeFileSync(path.join(HOME, ".orbis", "token"), "local-token\n");
    expect(resolveConnection({}, { HOME })).toMatchObject({ url: "http://127.0.0.1:7420", token: "local-token" });
    expect(resolveConnection({}, { HOME: home() }).token).toBeNull();
  });

  it("treats empty variables as unset and respects XDG_CONFIG_HOME", () => {
    const HOME = home();
    const xdg = path.join(HOME, "xdg");
    writeConfigFile({ HOME, XDG_CONFIG_HOME: xdg }, { url: "http://xdg:4", token: "t" });
    expect(configFilePath({ HOME, XDG_CONFIG_HOME: xdg })).toBe(path.join(xdg, "orbis", "config.json"));
    expect(resolveConnection({}, { HOME, XDG_CONFIG_HOME: xdg, ORBIS_URL: "  " }).url).toBe("http://xdg:4");
    expect(readConfigFile({ HOME: home() })).toEqual({});
  });
});
