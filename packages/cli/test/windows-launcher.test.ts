// specs/cli — the Windows launchers (change 0034-windows-launcher-scripts): Orbis.bat starts Orbis or
// restarts it when it is already running, Orbis-Token.bat shows or creates the login token, and the
// shortcuts carry the Orbis icon. The logic lives in Node (scripts/windows/*.mjs), so it is tested here:
// the parsers with what Windows prints, and the restart with two real launchers on a free port.
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import { DEFAULT_PORT } from "@orbis/shared";
// @ts-expect-error — plain ES modules in scripts/, with no type declarations
import * as launcher from "../../../scripts/windows/orbis-launcher.mjs";
// @ts-expect-error
import * as tokens from "../../../scripts/windows/token.mjs";
// @ts-expect-error
import { packIco } from "../../../scripts/ico.mjs";

const root = path.resolve(import.meta.dirname, "../../..");
const SCRIPT = path.join(root, "scripts/windows/orbis-launcher.mjs");

describe("what Windows prints", () => {
  const english = `
Active Connections

  Proto  Local Address          Foreign Address        State           PID
  TCP    0.0.0.0:135            0.0.0.0:0              LISTENING       1012
  TCP    127.0.0.1:7420         0.0.0.0:0              LISTENING       4242
  TCP    127.0.0.1:7420         127.0.0.1:50321        ESTABLISHED     4242
  TCP    127.0.0.1:74200        0.0.0.0:0              LISTENING       999
  TCP    [::1]:7420             [::]:0                 LISTENING       4242
  UDP    0.0.0.0:7420           *:*                                    777
`;
  // The same table on a Portuguese Windows: the state is OUVINDO, so the parser must not look for LISTENING.
  const portuguese = `
Conexões Ativas

  Proto  Endereço local         Endereço externo       Estado          PID
  TCP    127.0.0.1:7420         0.0.0.0:0              OUVINDO         5150
  TCP    127.0.0.1:7420         127.0.0.1:50321        ESTABELECIDA    5150
`;

  it("finds who listens on the port, in English and in Portuguese, and nothing else", () => {
    expect(launcher.parseNetstat(english, 7420)).toEqual([4242]);
    expect(launcher.parseNetstat(portuguese, 7420)).toEqual([5150]);
    expect(launcher.parseNetstat(english, 135)).toEqual([1012]);
    expect(launcher.parseNetstat(english, 8080)).toEqual([]);
    expect(launcher.parseNetstat("", 7420)).toEqual([]);
  });

  it("reads a process name from tasklist and stops only Node", () => {
    expect(launcher.parseTasklist('"node.exe","4242","Console","1","95.312 K"\r\n')).toBe("node.exe");
    expect(launcher.parseTasklist("INFO: No tasks are running which match the specified criteria.")).toBeNull();
    expect(launcher.isNodeProcess("node.exe")).toBe(true);
    expect(launcher.isNodeProcess("node")).toBe(true);
    expect(launcher.isNodeProcess("electron.exe")).toBe(false);
    expect(launcher.isNodeProcess("Orbis.exe")).toBe(false);
    expect(launcher.isNodeProcess(null)).toBe(false);
  });
});

describe("a restart seen from the old window", () => {
  afterEach(() => rmSync(launcher.RESTART_FLAG, { force: true }));

  it("is told only for the server a newer launcher stopped, and only while the note is fresh", () => {
    expect(launcher.wasRestarted(4242)).toBe(false); // no note: a crash or Ctrl+C
    writeFileSync(launcher.RESTART_FLAG, JSON.stringify([4242]));
    expect(launcher.wasRestarted(4242)).toBe(true);
    expect(launcher.wasRestarted(9999)).toBe(false); // another server's window
    expect(launcher.wasRestarted(4242, Date.now() + 120_000)).toBe(false); // an old note
    writeFileSync(launcher.RESTART_FLAG, "not json");
    expect(launcher.wasRestarted(4242)).toBe(false);
  });
});

describe("the launcher's options", () => {
  it("takes the options in Portuguese or English, the port from ORBIS_PORT, and refuses what it does not know", () => {
    expect(launcher.parseArgs([])).toEqual({ build: true, install: false, open: true, help: false });
    expect(launcher.parseArgs(["--rapido", "--instalar", "--sem-navegador"])).toEqual({ build: false, install: true, open: false, help: false });
    expect(launcher.parseArgs(["--no-build", "--install", "--no-open"])).toEqual({ build: false, install: true, open: false, help: false });
    expect(() => launcher.parseArgs(["--zzz"])).toThrow(/opcao desconhecida/);
    expect(launcher.portOf({})).toBe(7420);
    expect(launcher.portOf({ ORBIS_PORT: "8123" })).toBe(8123);
    expect(launcher.portOf({ ORBIS_PORT: "lixo" })).toBe(7420);
    expect(launcher.DEFAULT_PORT).toBe(DEFAULT_PORT);
  });
});

describe("the login token", () => {
  let dir: string;
  afterEach(() => rmSync(dir, { recursive: true, force: true }));
  const home = () => (dir = mkdtempSync(path.join(os.tmpdir(), "orbis-token-")));

  it("creates it in the hub's format when there is none, then keeps showing the same one", () => {
    const h = home();
    const first = tokens.ensureToken({ env: {}, home: h });
    expect(first).toMatchObject({ created: true, replaced: false, fromEnv: false, file: path.join(h, ".orbis", "token") });
    expect(first.token).toMatch(/^[A-Za-z0-9_-]{43}$/); // 32 bytes in base64url, like the hub's
    expect(readFileSync(first.file, "utf8")).toBe(`${first.token}\n`);
    expect(tokens.ensureToken({ env: {}, home: h })).toMatchObject({ token: first.token, created: false });
    if (process.platform !== "win32") expect(statSync(first.file).mode & 0o777).toBe(0o600);
  });

  it("replaces it only when asked, and follows ORBIS_DATA_DIR", () => {
    const h = home();
    const data = path.join(h, "dados");
    const env = { ORBIS_DATA_DIR: data };
    const first = tokens.ensureToken({ env, home: h });
    expect(first.file).toBe(path.join(data, "token"));
    const next = tokens.ensureToken({ env, home: h, rotate: true });
    expect(next).toMatchObject({ created: false, replaced: true });
    expect(next.token).not.toBe(first.token);
    expect(readFileSync(next.file, "utf8").trim()).toBe(next.token);
  });

  it("leaves the file alone when ORBIS_TOKEN decides, as the hub does", () => {
    const h = home();
    const result = tokens.ensureToken({ env: { ORBIS_TOKEN: "do-ambiente" }, home: h, rotate: true });
    expect(result).toMatchObject({ token: "do-ambiente", fromEnv: true, created: false });
    expect(existsSync(result.file)).toBe(false);
  });

  it("warns of a token that `orbis login` saved, which the CLI prefers", () => {
    const h = home();
    mkdirSync(path.join(h, ".config", "orbis"), { recursive: true });
    writeFileSync(path.join(h, ".config", "orbis", "config.json"), JSON.stringify({ token: "antigo" }));
    expect(tokens.savedLoginToken({}, h)).toBe("antigo");
    expect(tokens.savedLoginToken({}, path.join(h, "vazio"))).toBeNull();
  });

  it("prints the token and the signed-in address, and asks nothing when it only shows", async () => {
    const h = home();
    const lines: string[] = [];
    const code = await tokens.main(["--sem-copiar"], { ORBIS_DATA_DIR: path.join(h, "d"), ORBIS_PORT: "7421" }, (line: string) => lines.push(line));
    const made = readFileSync(path.join(h, "d", "token"), "utf8").trim();
    expect(code).toBe(0);
    expect(lines.join("\n")).toContain(made);
    expect(lines.join("\n")).toContain(`http://127.0.0.1:7421/#token=${made}`);
    expect(await tokens.main(["--zzz"], {}, () => undefined)).toBe(2);
  });
});

describe("the shortcut icon", () => {
  it("is an .ico with every size, the biggest at 256 pixels, from the brand's SVG", () => {
    const ico = readFileSync(path.join(root, "docs/brand/orbis.ico"));
    expect(ico.readUInt16LE(2)).toBe(1); // an icon
    const count = ico.readUInt16LE(4);
    expect(count).toBe(7);
    const sizes = Array.from({ length: count }, (_, i) => ico.readUInt8(6 + i * 16) || 256);
    expect(sizes).toEqual([16, 24, 32, 48, 64, 128, 256]);
    // Each image starts where its entry says and is a PNG.
    for (let i = 0; i < count; i++) {
      const at = ico.readUInt32LE(6 + i * 16 + 12);
      expect(ico.subarray(at, at + 4).toString("hex")).toBe("89504e47");
    }
  });

  it("packs images with their sizes and offsets", () => {
    const png = Buffer.from("89504e470d0a1a0a", "hex");
    const packed = packIco([
      { size: 16, png },
      { size: 256, png },
    ]);
    expect(packed.readUInt16LE(4)).toBe(2);
    expect(packed.readUInt8(6)).toBe(16);
    expect(packed.readUInt8(6 + 16)).toBe(0); // 0 means 256
    expect(packed.readUInt32LE(6 + 12)).toBe(6 + 32);
    expect(packed.readUInt32LE(6 + 16 + 12)).toBe(6 + 32 + png.length);
    expect(() => packIco([])).toThrow();
    expect(() => packIco([{ size: 512, png }])).toThrow(/between 1 and 256/);
  });

  it("is what the shortcuts use, for Orbis and for its token", () => {
    const ps = readFileSync(path.join(root, "scripts/windows/criar-atalhos.ps1"), "utf8");
    expect(ps).toContain("docs\\brand\\orbis.ico");
    expect(ps).toContain("Orbis.bat");
    expect(ps).toContain("Orbis-Token.bat");
    expect(ps).toContain("IconLocation");
    expect(ps).not.toMatch(/[^\x00-\x7f]/); // Windows PowerShell 5 reads a file with no BOM as ANSI
  });

  it("keeps the .bat files plain: ASCII, CRLF, and no parenthesis inside a block's text", () => {
    for (const name of ["Orbis.bat", "Orbis-Token.bat", "Orbis-Atalhos.bat"]) {
      const text = readFileSync(path.join(root, "scripts/windows", name), "utf8");
      expect(text, name).not.toMatch(/[^\x00-\x7f]/);
      expect(
        text.split("\n").every((line, i, all) => i === all.length - 1 || line.endsWith("\r")),
        `${name} uses CRLF`,
      ).toBe(true);
      // `echo text (like this)` inside `if ( ... )` ends the block early.
      let depth = 0;
      for (const line of text.split(/\r?\n/)) {
        if (/^\s*echo\b/i.test(line) && depth > 0) expect(line, `${name}: ${line}`).not.toMatch(/[()]/);
        if (/\(\s*$/.test(line)) depth++;
        if (/^\s*\)/.test(line) && !/\(\s*$/.test(line)) depth--;
        if (/^\s*\)\s*else\s*\(\s*$/.test(line)) depth++;
      }
    }
    expect(readFileSync(path.join(root, ".gitattributes"), "utf8")).toContain("*.bat text eol=crlf");
  });
});

// --- two real launchers: the second one restarts the first -------------------------------------------

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address() as { port: number };
      probe.close(() => resolve(port));
    });
  });
}

const health = async (port: number) => {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(1_000) });
    return res.ok;
  } catch {
    return false;
  }
};
const until = async (check: () => boolean | Promise<boolean>, ms = 20_000) => {
  for (const end = Date.now() + ms; Date.now() < end; ) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("timed out");
};

describe.skipIf(process.platform === "win32")("starting Orbis twice", () => {
  const running: ChildProcess[] = [];
  let data: string;
  beforeAll(() => {
    // The launcher runs the built CLI; a fresh checkout has only the hub built for the tests.
    if (!existsSync(path.join(root, "packages/cli/dist/index.js"))) {
      execFileSync(process.execPath, [path.join(root, "node_modules/typescript/bin/tsc"), "-b", "packages/shared", "packages/hub", "packages/cli"], {
        cwd: root,
        stdio: "inherit",
      });
    }
  }, 120_000);
  afterEach(() => {
    for (const child of running.splice(0)) child.kill("SIGKILL");
    rmSync(data, { recursive: true, force: true });
  });

  const start = (port: number, extra: string[] = []) => {
    data ??= "";
    const out: string[] = [];
    const child = spawn(process.execPath, [SCRIPT, "--rapido", "--sem-navegador", ...extra], {
      cwd: root,
      env: { ...process.env, ORBIS_PORT: String(port), ORBIS_DATA_DIR: data, ORBIS_TOKEN: "" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout!.on("data", (d) => out.push(String(d)));
    child.stderr!.on("data", (d) => out.push(String(d)));
    running.push(child);
    const exited = new Promise<number | null>((resolve) => child.on("close", (code) => resolve(code)));
    return { child, out: () => out.join(""), exited };
  };
  const owner = (port: number) => launcher.listeningPids(port, process.platform)[0] as number;

  it("restarts the Orbis that was running, keeps the data, and ends the old window without an error", async () => {
    data = mkdtempSync(path.join(os.tmpdir(), "orbis-launcher-"));
    const port = await freePort();
    const first = start(port);
    await until(() => health(port));
    const firstPid = owner(port);
    const token = readFileSync(path.join(data, "token"), "utf8").trim();
    expect(token.length).toBeGreaterThan(20);

    const second = start(port);
    await until(async () => (await health(port)) && owner(port) !== firstPid);
    expect(second.out()).toContain(`O Orbis ja esta rodando na porta ${port}: reiniciando.`);
    // The old window closes cleanly (a restart is not an error) and says why.
    expect(await first.exited).toBe(0);
    expect(first.out()).toContain("reiniciado em outra janela");
    expect(second.child.exitCode).toBeNull(); // the new one keeps serving
    // The data (and the token) are the same: nothing was lost in the restart.
    expect(readFileSync(path.join(data, "token"), "utf8").trim()).toBe(token);

    // Stopping the new one (Ctrl+C) ends it quietly.
    second.child.kill("SIGINT");
    expect(await second.exited).toBe(0);
    expect(second.out()).toContain("Orbis parado.");
  }, 60_000);

  it("does not touch a program that is not Orbis on the port", async () => {
    data = mkdtempSync(path.join(os.tmpdir(), "orbis-launcher-"));
    const port = await freePort();
    const squatter = createServer((socket) => socket.end()); // not an Orbis health answer: it just holds the port
    await new Promise<void>((resolve) => squatter.listen(port, "127.0.0.1", () => resolve()));
    try {
      const attempt = start(port);
      expect(await attempt.exited).toBe(1);
      expect(attempt.out()).toContain(`a porta ${port} esta ocupada por outro programa`);
      expect(attempt.out()).toContain("nao e o Orbis");
      expect(squatter.listening).toBe(true);
    } finally {
      squatter.close();
    }
  }, 30_000);

  it("stops with an error, and leaves a running Orbis alone, when it cannot build", async () => {
    data = mkdtempSync(path.join(os.tmpdir(), "orbis-launcher-"));
    const port = await freePort();
    const first = start(port);
    await until(() => health(port));
    const firstPid = owner(port);
    // Without --rapido it runs `npm run build` in the repo: point npm at a failing script through PATH.
    const bin = mkdtempSync(path.join(os.tmpdir(), "orbis-fakenpm-"));
    writeFileSync(path.join(bin, "npm"), "#!/bin/sh\necho 'build quebrou'\nexit 1\n", { mode: 0o755 });
    const out: string[] = [];
    const attempt = spawn(process.execPath, [SCRIPT, "--sem-navegador"], {
      cwd: root,
      env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}`, ORBIS_PORT: String(port), ORBIS_DATA_DIR: data },
      stdio: ["ignore", "pipe", "pipe"],
    });
    attempt.stdout!.on("data", (d) => out.push(String(d)));
    attempt.stderr!.on("data", (d) => out.push(String(d)));
    running.push(attempt);
    const code = await new Promise<number | null>((resolve) => attempt.on("close", (c) => resolve(c)));
    rmSync(bin, { recursive: true, force: true });
    expect(code).toBe(1);
    expect(out.join("")).toContain("o npm run build falhou: o Orbis que ja estava rodando nao foi tocado");
    expect(await health(port)).toBe(true);
    expect(owner(port)).toBe(firstPid);
    expect(first.child.exitCode).toBeNull();
  }, 60_000);
});
