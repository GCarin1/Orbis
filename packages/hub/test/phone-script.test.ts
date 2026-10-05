// specs/android-app — Orbis on the phone (change 0052, ADR 0018): scripts/android/orbis-termux.sh, run
// against stand-ins for Termux's apt and proot-distro, and a stand-in hub. It installs what Termux needs,
// lets the app start commands, sets Debian up from a clean environment, installs a wrapper; it serves the
// hub with the app's token (kept private), finds it already running, starts it again with a new token,
// stops it, and says when Orbis is not installed. (The real install ran in Debian under Termux's proot.)
import { afterEach, describe, expect, it } from "vitest";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT = fileURLToPath(new URL("../../../scripts/android/orbis-termux.sh", import.meta.url));

/** A stand-in hub: /health answers, /api/v1/voice takes only the ORBIS_TOKEN it was started with. */
const FAKE_HUB = `
const args = process.argv.slice(2);
const value = (name) => (args.find((a) => a.startsWith(name + "=")) || "").slice(name.length + 1);
const token = value("ORBIS_TOKEN");
require("node:http").createServer((req, res) => {
  if (req.url === "/health") return res.writeHead(200).end("{}");
  res.writeHead(req.headers.authorization === "Bearer " + token ? 200 : 401).end();
}).listen(Number(value("ORBIS_PORT")), "127.0.0.1");
`;

/** proot-distro 5 (a distro is containers/<name>/rootfs): logs each call; inside Debian, bash -s keeps the script, node runs the stand-in hub. */
const PROOT_DISTRO = `#!/bin/bash
echo "$*" >> "$LOG/proot-distro"
case "$1" in
  install) mkdir -p "$PREFIX/var/lib/proot-distro/containers/$2/rootfs/root" ;;
  remove) rm -rf "$PREFIX/var/lib/proot-distro/containers/$2" ;;
  login)
    while [ "$1" != "--" ]; do shift; done; shift
    printf '%s\\n' "$@" > "$LOG/login-args"
    for a in "$@"; do case "$a" in /usr/bin/env | -i | *=*) ;; *) cmd="$a"; break ;; esac; done
    case "$cmd" in
      bash) cat > "$LOG/inner.sh" ;;
      node) exec node "$FAKE_HUB" "$@" ;;
      claude) echo "9.9.9 (Claude Code)" ;;
    esac ;;
esac
`;

interface Phone {
  dir: string;
  env: NodeJS.ProcessEnv;
  rootfs: string;
  log(name: string): string;
}

let phones: Phone[] = [];
let children: ChildProcess[] = [];

afterEach(() => {
  for (const child of children) child.kill("SIGKILL");
  for (const phone of phones) {
    spawnSync("pkill", ["-f", `${phone.dir}/fake-hub.cjs`]);
    rmSync(phone.dir, { recursive: true, force: true });
  }
  phones = [];
  children = [];
});

async function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const server = createServer().listen(0, "127.0.0.1", () => {
      const port = (server.address() as { port: number }).port;
      server.close(() => resolve(port));
    });
  });
}

async function phone(): Promise<Phone> {
  const dir = mkdtempSync(path.join(tmpdir(), "orbis-phone-"));
  const bin = path.join(dir, "usr", "bin");
  mkdirSync(bin, { recursive: true });
  mkdirSync(path.join(dir, "home"));
  mkdirSync(path.join(dir, "log"));
  const tool = (name: string, body: string) => {
    writeFileSync(path.join(bin, name), body);
    chmodSync(path.join(bin, name), 0o755);
  };
  tool("proot-distro", PROOT_DISTRO);
  tool("apt-get", '#!/bin/bash\necho "$*" >> "$LOG/apt-get"\n');
  tool("am", '#!/bin/bash\necho "$*" >> "$LOG/am"\n');
  tool("termux-reload-settings", '#!/bin/bash\necho reloaded >> "$LOG/reloaded"\n');
  tool("termux-wake-lock", '#!/bin/bash\necho lock >> "$LOG/wake"\n');
  tool("termux-wake-unlock", '#!/bin/bash\necho unlock >> "$LOG/wake"\n');
  writeFileSync(path.join(dir, "fake-hub.cjs"), FAKE_HUB);
  const env: NodeJS.ProcessEnv = {
    PATH: `${bin}:${process.env.PATH}`,
    HOME: path.join(dir, "home"),
    PREFIX: path.join(dir, "usr"),
    LOG: path.join(dir, "log"),
    FAKE_HUB: path.join(dir, "fake-hub.cjs"),
    ORBIS_PORT: String(await freePort()),
    // Termux's own variables, which must not reach Debian.
    LD_PRELOAD: "",
    TMPDIR: path.join(dir, "usr", "tmp"),
  };
  const p: Phone = {
    dir,
    env,
    rootfs: path.join(dir, "usr", "var", "lib", "proot-distro", "installed-rootfs", "debian"),
    log: (name) => (existsSync(path.join(dir, "log", name)) ? readFileSync(path.join(dir, "log", name), "utf8") : ""),
  };
  phones.push(p);
  return p;
}

const run = (p: Phone, args: string[], input?: string) => spawnSync("bash", [SCRIPT, ...args], { env: p.env, input, encoding: "utf8", timeout: 60_000 });

/** Start `serve` the way the app does (token on stdin, no terminal); it runs until stopped. */
function serve(p: Phone, token: string): ChildProcess {
  const child = spawn("bash", [SCRIPT, "serve", "--token-stdin"], { env: p.env, stdio: ["pipe", "ignore", "ignore"] });
  child.stdin!.end(`${token}\n`);
  children.push(child);
  return child;
}

async function status(p: Phone, token: string): Promise<number> {
  try {
    const res = await fetch(`http://127.0.0.1:${p.env.ORBIS_PORT}/api/v1/voice`, { headers: { authorization: `Bearer ${token}` } });
    return res.status;
  } catch {
    return 0;
  }
}

async function until(check: () => Promise<boolean>, ms = 15_000): Promise<void> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("never happened");
}

function installed(p: Phone): void {
  mkdirSync(path.join(p.rootfs, "root", "orbis", "packages", "cli", "dist"), { recursive: true });
  writeFileSync(path.join(p.rootfs, "root", "orbis", "packages", "cli", "dist", "index.js"), "");
}

describe.skipIf(process.platform === "win32")("Orbis installed on the phone", () => {
  it("updates Termux, lets the app start commands, sets Debian up from a clean environment and installs orbis-phone", async () => {
    const p = await phone();
    mkdirSync(path.join(p.env.HOME!, ".termux"));
    writeFileSync(path.join(p.env.HOME!, ".termux", "termux.properties"), "# allow-external-apps = true\nextra-keys = []\n");
    const first = run(p, ["install"]);
    expect(first.status, first.stderr).toBe(0);

    expect(p.log("apt-get")).toMatch(/full-upgrade/);
    expect(p.log("apt-get")).toMatch(/--force-confold.*install proot-distro curl procps/);
    const properties = readFileSync(path.join(p.env.HOME!, ".termux", "termux.properties"), "utf8");
    expect(properties).toBe("extra-keys = []\nallow-external-apps = true\n");
    expect(p.log("reloaded")).toBe("reloaded\n");
    expect(p.log("proot-distro")).toMatch(/^install debian$/m);

    // Debian gets the install script and a clean environment: Node's PATH, never Termux's PREFIX.
    const inner = p.log("inner.sh");
    expect(inner).toMatch(/latest-v\$NODE_MAJOR\.x/);
    // Python's pipx, for the MCP servers written in Python (Instagram, Google Analytics).
    expect(inner).toMatch(/apt-get install .*python3 pipx/);
    expect(inner).toMatch(/npm ci --ignore-scripts/);
    expect(inner).toMatch(/npm install -g .* @anthropic-ai\/claude-code /);
    expect(inner).toMatch(/@anthropic-ai\/claude-code@\$CLAUDE_JS_VERSION/);
    const login = p.log("login-args").split("\n");
    expect(login.slice(0, 3)).toEqual(["/usr/bin/env", "-i", "PATH=/opt/node/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"]);
    expect(login).toContain("CLAUDE_JS_VERSION=2.1.112");
    expect(login).toContain("REPO=https://github.com/GCarin1/Orbis.git");
    expect(login.some((a) => a.startsWith("PREFIX=") || a.startsWith("LD_PRELOAD=") || a.startsWith("TMPDIR="))).toBe(false);

    // orbis-phone runs the script of the checkout inside Debian, so `update` brings the script too. It looks for
    // Debian where proot-distro 5 keeps it, and where older ones did.
    const wrapper = readFileSync(path.join(p.env.PREFIX!, "bin", "orbis-phone"), "utf8");
    expect(wrapper).toContain(`${p.env.PREFIX}/var/lib/proot-distro/containers/debian/rootfs`);
    expect(wrapper).toContain(`${p.env.PREFIX}/var/lib/proot-distro/installed-rootfs/debian`);
    expect(wrapper).toContain('[ -f "$script" ] && exec bash "$script" "$@"');
    expect(readFileSync(path.join(p.env.HOME!, ".orbis-phone", "config"), "utf8")).toMatch(/ORBIS_REPO=/);

    // Again: Debian is there already.
    expect(run(p, ["install"]).status).toBe(0);
    expect(p.log("proot-distro").match(/^install debian$/gm)).toHaveLength(1);
  });
});

describe.skipIf(process.platform === "win32")("Debian under proot-distro 5", () => {
  const containerRoot = (p: Phone) => path.join(p.env.PREFIX!, "var", "lib", "proot-distro", "containers", "debian", "rootfs");

  it("finds Debian in containers/<name>/rootfs, does not install it again, and orbis-phone reaches the script there", async () => {
    const p = await phone();
    const root = containerRoot(p);
    mkdirSync(path.join(root, "root", "orbis", "packages", "cli", "dist"), { recursive: true });
    writeFileSync(path.join(root, "root", "orbis", "packages", "cli", "dist", "index.js"), "");
    mkdirSync(path.join(root, "root", "orbis", "scripts", "android"), { recursive: true });
    copyFileSync(SCRIPT, path.join(root, "root", "orbis", "scripts", "android", "orbis-termux.sh"));

    const install = run(p, ["install"]);
    expect(install.status, install.stderr).toBe(0);
    expect(p.log("proot-distro")).not.toMatch(/^install debian$/m);
    expect(p.log("proot-distro")).not.toMatch(/^remove debian$/m);

    const wrapper = spawnSync("bash", [path.join(p.env.PREFIX!, "bin", "orbis-phone"), "status"], { env: p.env, encoding: "utf8", timeout: 30_000 });
    expect(wrapper.stdout).toMatch(/Orbis is stopped[\s\S]*Claude Code: 9\.9\.9/);

    serve(p, "token-one");
    await until(async () => (await status(p, "token-one")) === 200);
  });

  it("installs Debian again over a copy that never finished, instead of stopping at 'already exists'", async () => {
    const p = await phone();
    mkdirSync(containerRoot(p), { recursive: true });
    const install = run(p, ["install"]);
    expect(install.status, install.stderr).toBe(0);
    expect(p.log("proot-distro")).toMatch(/^remove debian$/m);
    expect(p.log("proot-distro")).toMatch(/^install debian$/m);
  });

  it("says Orbis is not installed (exit 127, what the app reads) when the wrapper finds no Debian", async () => {
    const p = await phone();
    expect(run(p, ["install"]).status).toBe(0);
    const wrapper = spawnSync("bash", [path.join(p.env.PREFIX!, "bin", "orbis-phone"), "serve"], { env: p.env, encoding: "utf8", timeout: 30_000 });
    expect(wrapper.status).toBe(127);
    expect(wrapper.stderr).toMatch(/Orbis is not installed on this phone/);
  });
});

describe.skipIf(process.platform === "win32")("the hub on the phone", () => {
  it("serves with the app's token, kept private, and is found running on the next start", async () => {
    const p = await phone();
    installed(p);
    serve(p, "token-one");
    await until(async () => (await status(p, "token-one")) === 200);
    expect(await status(p, "another")).toBe(401);
    // Started by the app, it keeps the phone's CPU awake: bots answer and routines fire with the screen off.
    expect(p.log("wake")).toBe("lock\n");
    const tokenFile = path.join(p.env.HOME!, ".orbis-phone", "token");
    expect(readFileSync(tokenFile, "utf8")).toBe("token-one");
    expect(statSync(tokenFile).mode & 0o777).toBe(0o600);
    const login = p.log("login-args").split("\n");
    expect(login).toEqual(
      expect.arrayContaining([
        "ORBIS_HOST=127.0.0.1",
        `ORBIS_PORT=${p.env.ORBIS_PORT}`,
        "ORBIS_TOKEN=token-one",
        "node",
        "/root/orbis/packages/cli/dist/index.js",
        "serve",
      ]),
    );

    const again = run(p, ["serve", "--token-stdin"], "token-one\n");
    expect(again.status).toBe(0);
    expect(again.stdout).toMatch(/already running/);
    expect(p.log("proot-distro").match(/ node /g)).toHaveLength(1);
    expect(run(p, ["status"]).stdout).toMatch(/running on http:\/\/127\.0\.0\.1:\d+[\s\S]*Claude Code: 9\.9\.9/);
    expect(run(p, ["token"]).stdout).toBe(`token-one\nhttp://127.0.0.1:${p.env.ORBIS_PORT}/#token=token-one\n`);
  });

  it("starts again with a new token from the app, and stops", async () => {
    const p = await phone();
    installed(p);
    serve(p, "token-one");
    await until(async () => (await status(p, "token-one")) === 200);
    serve(p, "token-two");
    await until(async () => (await status(p, "token-two")) === 200);
    expect(await status(p, "token-one")).toBe(401);

    const stopped = run(p, ["stop"]);
    expect(stopped.status, stopped.stderr).toBe(0);
    expect(await status(p, "token-two")).toBe(0);
  });

  it("opens the app signed in from Termux, with no Android permission, starting the hub when it is stopped", async () => {
    const p = await phone();
    installed(p);
    mkdirSync(path.join(p.rootfs, "root", ".orbis"), { recursive: true });
    writeFileSync(path.join(p.rootfs, "root", ".orbis", "token"), "hub-token");
    const opened = run(p, ["open"]);
    expect(opened.status, opened.stderr).toBe(0);
    const health = await fetch(`http://127.0.0.1:${p.env.ORBIS_PORT}/health`);
    expect(health.status).toBe(200);
    const am = p.log("am");
    expect(am).toMatch(/start -a android\.intent\.action\.SEND -t text\/plain/);
    expect(am).toContain(`--es android.intent.extra.TEXT http://127.0.0.1:${p.env.ORBIS_PORT}/#token=hub-token`);
    expect(am).toContain("-n app.orbis.android/.MainActivity");

    // Running already: it only opens the app again, with the same link.
    expect(run(p, ["open"]).status).toBe(0);
    expect(p.log("am").trim().split("\n")).toHaveLength(2);
    expect(p.log("proot-distro").match(/ node /g)).toHaveLength(1);
  });

  it("says Orbis is not installed, and keeps it in the log", async () => {
    const p = await phone();
    const result = run(p, ["serve", "--token-stdin"], "token-one\n");
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/Orbis is not installed on this phone/);
    expect(readFileSync(path.join(p.env.HOME!, ".orbis-phone", "hub.log"), "utf8")).toMatch(/Orbis is not installed/);
    expect(run(p, ["nonsense"]).stderr).toMatch(/unknown command: nonsense/);
  });
});
