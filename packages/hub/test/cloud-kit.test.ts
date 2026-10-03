// specs/hub-api — the cloud kit (change 0051): the hub's image, its compose file with the tunnels, and
// the Codespaces dev container keep what makes a hub on a server safe and lasting — its data and
// Claude Code's login on one volume, the port on the machine only, the subscription token and never
// an API key, no secret written in the files.
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

describe("the hub's image", () => {
  const docker = read("Dockerfile");

  it("serves on every address at 7420 with its data and Claude Code's login in /data, as a plain user", () => {
    expect(docker).toMatch(/ORBIS_HOST=0\.0\.0\.0/);
    expect(docker).toMatch(/ORBIS_PORT=7420/);
    expect(docker).toMatch(/ORBIS_DATA_DIR=\/data/);
    expect(docker).toMatch(/CLAUDE_CONFIG_DIR=\/data\/claude/);
    expect(docker).toMatch(/VOLUME \["\/data"\]/);
    expect(docker).toMatch(/^USER node$/m);
    expect(docker).toMatch(/npm install -g "@anthropic-ai\/claude-code@/);
    expect(docker).toMatch(/CMD \["node", "\/app\/packages\/cli\/dist\/index\.js", "serve"\]/);
    expect(docker).toMatch(/curl -fsS http:\/\/127\.0\.0\.1:7420\/health /);
  });

  it("sets no key or token of its own", () => {
    expect(docker).not.toMatch(/^\s*(ENV|ARG)\b[^\n]*(ANTHROPIC_API_KEY|ANTHROPIC_AUTH_TOKEN|CLAUDE_CODE_OAUTH_TOKEN|ORBIS_TOKEN)/m);
    expect(read(".dockerignore")).toMatch(/^\.env$/m);
  });
});

describe("the compose file", () => {
  const compose = read("deploy/docker-compose.yml");

  it("publishes the port on the machine only, keeps the data on a volume, and has the tunnels as profiles", () => {
    expect(compose).toMatch(/"127\.0\.0\.1:\$\{ORBIS_PORT:-7420\}:7420"/);
    expect(compose).toMatch(/- orbis-data:\/data/);
    expect(compose).toMatch(/CLAUDE_CODE_OAUTH_TOKEN: \$\{CLAUDE_CODE_OAUTH_TOKEN:-\}/);
    expect(compose).toMatch(/profiles: \["quick-tunnel"\][\s\S]*--url http:\/\/orbis:7420/);
    expect(compose).toMatch(/profiles: \["tunnel"\][\s\S]*TUNNEL_TOKEN: \$\{TUNNEL_TOKEN:-\}/);
    expect(compose).not.toMatch(/ANTHROPIC_API_KEY|ANTHROPIC_AUTH_TOKEN/);
  });

  it("comes with an example environment whose secrets are empty, and the real one is ignored by git", () => {
    const example = read("deploy/.env.example");
    for (const name of ["ORBIS_TOKEN", "CLAUDE_CODE_OAUTH_TOKEN", "TUNNEL_TOKEN"]) expect(example).toMatch(new RegExp(`^${name}=$`, "m"));
    expect(read(".gitignore")).toMatch(/^\.env$/m);
  });
});

describe("the Codespaces dev container", () => {
  // JSON with comments: drop the whole-line ones.
  const dev = JSON.parse(
    read(".devcontainer/devcontainer.json")
      .split("\n")
      .filter((l) => !l.trim().startsWith("//"))
      .join("\n"),
  ) as {
    containerEnv: Record<string, string>;
    secrets: Record<string, { description: string }>;
    forwardPorts: number[];
    postStartCommand: string;
    postAttachCommand: string;
  };

  it("forwards 7420, keeps the data outside the repository, and asks for the two tokens as Codespaces secrets", () => {
    expect(dev.forwardPorts).toEqual([7420]);
    expect(dev.containerEnv.ORBIS_HOST).toBe("0.0.0.0");
    expect(dev.containerEnv.ORBIS_DATA_DIR).toBe("/workspaces/.orbis-data");
    expect(dev.containerEnv.CLAUDE_CONFIG_DIR).toBe("/workspaces/.orbis-data/claude");
    expect(Object.keys(dev.secrets).sort()).toEqual(["CLAUDE_CODE_OAUTH_TOKEN", "ORBIS_TOKEN"]);
    expect(dev.secrets.CLAUDE_CODE_OAUTH_TOKEN!.description).toContain("claude setup-token");
    expect(dev.postStartCommand).toBe("bash .devcontainer/start.sh --quiet");
    expect(dev.postAttachCommand).toBe("bash .devcontainer/start.sh");
  });

  it.skipIf(process.platform === "win32")("has a start script that bash reads", () => {
    expect(() => execFileSync("bash", ["-n", path.join(root, ".devcontainer/start.sh")])).not.toThrow();
  });
});
