// specs/cloud — Orbis on a server that stays on (change 0069-server-runner, ADR 0025): scripts/server/orbis-server.sh,
// run against stand-ins for Docker, git and Docker's installer. It installs Docker when missing, clones Orbis,
// writes deploy/.env readable only by its owner with the cloud's address, starts the hub, links it with the
// cloud from that file, brings a .orbis file in and removes it after, and lists its commands.
import { afterEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT = fileURLToPath(new URL("../../../scripts/server/orbis-server.sh", import.meta.url));

let dirs: string[] = [];
afterEach(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
  dirs = [];
});

/** A server: a home, stand-in commands on PATH that log their calls, Docker installed or not. */
function server(withDocker: boolean) {
  const dir = mkdtempSync(path.join(tmpdir(), "orbis-server-"));
  dirs.push(dir);
  const bin = path.join(dir, "bin");
  const log = path.join(dir, "log");
  mkdirSync(bin);
  mkdirSync(log);
  const stub = (name: string, body: string) => {
    writeFileSync(path.join(bin, name), `#!/bin/bash\necho "$*" >> "${log}/${name}"\n${body}\n`);
    chmodSync(path.join(bin, name), 0o755);
  };
  const docker = `case "$1" in info) exit 0 ;; esac`;
  if (withDocker) stub("docker", docker);
  else {
    // Docker's installer, piped from curl to sh: it puts docker on PATH.
    const later = path.join(dir, "docker-to-install");
    writeFileSync(later, `#!/bin/bash\necho "$*" >> "${log}/docker"\n${docker}\n`);
    stub("curl", `echo 'cp "${later}" "${bin}/docker"; chmod +x "${bin}/docker"'`);
  }
  stub("sudo", `"$@"`);
  stub("usermod", "");
  stub("id", `case "$1" in -u) echo 1000 ;; -un) echo ubuntu ;; esac`);
  stub("install", "");
  // git clone makes the checkout the script expects.
  stub("git", `if [ "$1" = clone ]; then dest="\${@: -1}"; mkdir -p "$dest/deploy" "$dest/.git" "$dest/scripts/server"; touch "$dest/deploy/docker-compose.yml"; fi`);
  // Only the tools the script needs, so a Docker on this machine stays out of the test.
  const tools = path.join(dir, "tools");
  mkdirSync(tools);
  for (const t of ["bash", "sh", "sed", "grep", "cut", "mkdir", "chmod", "cat", "cp", "rm", "touch", "env", "head"]) {
    const found = spawnSync("bash", ["-c", `command -v ${t}`], { encoding: "utf8" }).stdout.trim();
    if (found) symlinkSync(found, path.join(tools, t));
  }
  const env = { PATH: `${bin}:${tools}`, HOME: dir, ORBIS_SERVER_DIR: path.join(dir, "orbis"), ORBIS_SERVER_BIN: path.join(dir, "orbis-server") };
  const run = (args: string[], extra: Record<string, string> = {}) => spawnSync("bash", [SCRIPT, ...args], { env: { ...env, ...extra }, encoding: "utf8", input: "" });
  const logOf = (name: string) => (existsSync(path.join(log, name)) ? readFileSync(path.join(log, name), "utf8") : "");
  return { dir, run, logOf, orbis: env.ORBIS_SERVER_DIR };
}

describe("orbis-server.sh", () => {
  it("installs Docker when missing, clones Orbis, writes its settings privately and starts the hub", () => {
    const s = server(false);
    const r = s.run(["install"], { ORBIS_CLOUD_URL: "https://orbis.ana.workers.dev", CLAUDE_CODE_OAUTH_TOKEN: "sk-ant-oat-x", ORBIS_BRANCH: "main" });
    expect(r.stderr).not.toMatch(/orbis-server:/);
    expect(r.status).toBe(0);
    expect(s.logOf("curl")).toContain("https://get.docker.com");
    expect(s.logOf("git")).toMatch(/clone --branch main https:\/\/github.com\/GCarin1\/Orbis.git/);
    const env = path.join(s.orbis, "deploy/.env");
    expect(readFileSync(env, "utf8")).toContain("ORBIS_CLOUD_URL=https://orbis.ana.workers.dev");
    expect(readFileSync(env, "utf8")).toContain("CLAUDE_CODE_OAUTH_TOKEN=sk-ant-oat-x");
    expect(statSync(env).mode & 0o077).toBe(0);
    expect(s.logOf("docker")).toContain("compose up -d --build orbis");
    expect(r.stdout).toContain("Next: orbis-server link");
  });

  it("links the hub with the cloud named in its settings, and imports a .orbis file, removed after", () => {
    const s = server(true);
    expect(s.run(["install"], { ORBIS_CLOUD_URL: "https://orbis.ana.workers.dev" }).status).toBe(0);
    expect(s.logOf("curl")).toBe("");

    expect(s.run(["link"]).status).toBe(0);
    expect(s.logOf("docker")).toContain("compose exec -T orbis node /app/packages/cli/dist/index.js link --name Orbis — servidor --cloud https://orbis.ana.workers.dev");
    expect(s.run(["link", "--status"]).status).toBe(0);
    expect(s.logOf("docker")).toContain("index.js link --status");

    const file = path.join(s.dir, "phone.orbis");
    writeFileSync(file, "PK");
    expect(s.run(["import", file, "--password"]).status).toBe(0);
    const calls = s.logOf("docker");
    expect(calls).toContain(`compose cp ${file} orbis:/data/import.orbis`);
    expect(calls).toContain("index.js data import /data/import.orbis --password");
    expect(calls).toContain("compose exec -T orbis rm -f /data/import.orbis");
    expect(s.run(["import", path.join(s.dir, "missing.orbis")]).stderr).toContain("no such file");
  });

  it("lists its commands, and says when Orbis is not installed", () => {
    const s = server(true);
    const help = s.run(["help"]).stdout;
    for (const c of ["install", "link", "unlink", "import F", "status", "logs", "update", "stop | start"]) expect(help).toContain(c);
    expect(s.run(["bogus"]).status).toBe(2);
    expect(s.run(["status"]).stderr).toContain("Orbis is not installed");
  });
});
