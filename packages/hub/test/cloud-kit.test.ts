// specs/hub-api — the cloud kit (change 0051): the hub's image, its compose file with Caddy for HTTPS (change 0070), and
// the Codespaces dev container keep what makes a hub on a server safe and lasting — its data and
// Claude Code's login on one volume, the port on the machine only, the subscription token and never
// an API key, no secret written in the files.
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

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

  it("publishes the hub's port on the machine only, keeps the data on a volume, and has Caddy for HTTPS as a profile", () => {
    expect(compose).toMatch(/"127\.0\.0\.1:\$\{ORBIS_PORT:-7420\}:7420"/);
    expect(compose).toMatch(/- orbis-data:\/data/);
    expect(compose).toMatch(/CLAUDE_CODE_OAUTH_TOKEN: \$\{CLAUDE_CODE_OAUTH_TOKEN:-\}/);
    // Only Caddy faces the internet (change 0070): 80 for the certificate, 443 for Orbis.
    expect(compose).toMatch(/profiles: \["https"\][\s\S]*image: caddy:[\s\S]*"443:443"/);
    expect(compose).toMatch(/ORBIS_PUBLIC_URL: \$\{ORBIS_PUBLIC_URL:-\}/);
    expect(compose).not.toMatch(/cloudflared|TUNNEL_TOKEN/);
    expect(compose).not.toMatch(/ANTHROPIC_API_KEY|ANTHROPIC_AUTH_TOKEN/);
  });

  it("comes with an example environment whose secrets are empty, and the real one is ignored by git", () => {
    const example = read("deploy/.env.example");
    for (const name of ["ORBIS_TOKEN", "CLAUDE_CODE_OAUTH_TOKEN", "ORBIS_DOMAIN", "ORBIS_PUBLIC_URL"]) expect(example).toMatch(new RegExp(`^${name}=$`, "m"));
    expect(read(".gitignore")).toMatch(/^\.env$/m);
  });

  it("serves Orbis over HTTPS with the browser's protections, and frames only the computer's live view", () => {
    const caddy = read("deploy/Caddyfile");
    expect(caddy).toMatch(/^\{\$ORBIS_DOMAIN\} \{/m);
    expect(caddy).toMatch(/reverse_proxy orbis:7420/);
    for (const h of ["Strict-Transport-Security", "X-Content-Type-Options nosniff", "Referrer-Policy no-referrer", "X-Frame-Options DENY", "frame-ancestors 'none'"]) expect(caddy).toContain(h);
    expect(caddy).not.toMatch(/'unsafe-eval'|script-src[^;]*'unsafe-inline'/);
    // The one inline script of the web app, by its hash.
    const html = read("packages/web/index.html");
    const inline = /<script>([\s\S]*?)<\/script>/.exec(html)![1]!;
    expect(caddy).toContain(`'sha256-${createHash("sha256").update(inline).digest("base64")}'`);
  });
});

describe("one person's stack on a home server (change 0071, docs/umbrel.md)", () => {
  const text = read("deploy/umbrel/docker-compose.yml");
  const ENV: Record<string, string> = { ORBIS_NAME: "gabriel", ORBIS_TAILNET: "tail1234.ts.net", TS_AUTHKEY: "tskey-auth-x" };
  // Compose's own interpolation, enough for this file: ${VAR}, ${VAR:-default}, ${VAR:?error}, and $$ for a $.
  const interpolate = (value: string, env: Record<string, string> = ENV) =>
    value.replace(/\$\$|\$\{(\w+)(?::([-?])([^}]*))?\}/g, (all, name?: string, kind?: string, fallback?: string) => {
      if (all === "$$") return "$";
      if (env[name!] !== undefined) return env[name!]!;
      if (kind === "?") throw new Error(`${name} is required`);
      return fallback ?? "";
    });
  const stack = parse(text) as { services: Record<string, { image: string; ports?: unknown; environment: Record<string, string>; command?: string[]; volumes: string[]; mem_limit?: string; restart: string; pull_policy?: string }> };
  const { orbis, tailscale } = stack.services as Record<string, (typeof stack.services)[string]>;

  it("opens no port: the hub is reached only through its own Tailscale node, which serves HTTPS and never Funnel", () => {
    expect(orbis!.ports).toBeUndefined();
    expect(tailscale!.ports).toBeUndefined();
    const serve = JSON.parse(interpolate(tailscale!.environment.ORBIS_SERVE!)) as Record<string, Record<string, unknown>>;
    expect(serve.TCP).toEqual({ "443": { HTTPS: true } });
    expect(serve.Web).toEqual({ "orbis-gabriel.tail1234.ts.net:443": { Handlers: { "/": { Proxy: "http://orbis:7420" } } } });
    expect(serve.AllowFunnel).toEqual({ "orbis-gabriel.tail1234.ts.net:443": false });
    // The serve file is written from that variable, then the image's own start runs.
    expect(tailscale!.command!.join(" ")).toMatch(/printf '%s' "\$\$ORBIS_SERVE" > \/tmp\/serve\.json && exec \/usr\/local\/bin\/containerboot/);
    expect(tailscale!.environment.TS_SERVE_CONFIG).toBe("/tmp/serve.json");
  });

  it("gives each person their own hub: the published image, its own data and node, the address it is opened at, restarted on its own", () => {
    expect(orbis!.image).toBe("${ORBIS_IMAGE:-ghcr.io/gcarin1/orbis:latest}");
    expect(interpolate(orbis!.environment.ORBIS_PUBLIC_URL!)).toBe("https://orbis-gabriel.tail1234.ts.net");
    expect(interpolate(tailscale!.environment.TS_HOSTNAME!)).toBe("orbis-gabriel");
    expect(orbis!.volumes).toEqual(["orbis-data:/data"]);
    expect(tailscale!.volumes).toEqual(["tailscale-state:/var/lib/tailscale"]);
    for (const s of [orbis!, tailscale!]) expect(s.restart).toBe("unless-stopped");
    expect(orbis!.mem_limit).toBe("${ORBIS_MEMORY:-1536m}");
    // The hub makes its own long token; no key or token is written in the file.
    expect(orbis!.environment.ORBIS_TOKEN).toBe("");
    expect(text).not.toMatch(/tskey-[a-z]+-\w{6,}|sk-ant-/);
    // A stack without its name, tailnet or auth key does not start.
    const all = Object.values({ ...orbis!.environment, ...tailscale!.environment }).map(String);
    for (const name of Object.keys(ENV)) {
      const without = Object.fromEntries(Object.entries(ENV).filter(([k]) => k !== name));
      expect(() => all.forEach((v) => interpolate(v, without)), name).toThrow(`${name} is required`);
    }
  });

  it("fetches the newest image on every redeploy, never keeping a stale one (chore 0076)", () => {
    expect(orbis!.pull_policy).toBe("always");
  });

  it("is published ready, so a home server compiles nothing: amd64 always, arm64 on demand (change 0072)", () => {
    const workflow = read(".github/workflows/server-image.yml");
    expect(workflow).toMatch(/platforms: \$\{\{ inputs\.arm64 && 'linux\/amd64,linux\/arm64' \|\| 'linux\/amd64' \}\}/);
    // The emulator for arm64 runs only when arm64 was asked for.
    expect(workflow).toMatch(/setup-qemu-action@v3\n\s+if: inputs\.arm64/);
    expect(workflow).toMatch(/push: true/);
    expect(workflow).toMatch(/ghcr\.io\/\$\{GITHUB_REPOSITORY_OWNER,,\}\/orbis/);
    expect(workflow).toMatch(/packages: write/);
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
