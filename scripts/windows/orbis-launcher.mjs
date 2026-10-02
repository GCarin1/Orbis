// Starts Orbis, or restarts it when it is already running (the logic behind Orbis.bat).
//
//   node scripts/windows/orbis-launcher.mjs [--rapido] [--instalar] [--sem-navegador]
//
// 1. installs the dependencies when they are missing (or with --instalar) and builds, unless --rapido;
// 2. looks at the port (ORBIS_PORT, default 7420): an Orbis hub answering there is stopped, and the
//    program refuses to touch anything else that holds the port;
// 3. starts `orbis serve` in this window (closing it stops Orbis) and opens the web app already signed in.
//
// It lives in Node, not in the .bat, so it reads the same on every system and is tested.
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { dataDirOf } from "./token.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, "../..");
/** The hub's default port (packages/shared DEFAULT_PORT; a test keeps the two equal). */
export const DEFAULT_PORT = 7420;
/** Written before an old Orbis is stopped, with its process ids, so the window it ran in closes without an error. */
export const RESTART_FLAG = path.join(os.tmpdir(), "orbis-restarting.flag");
const FLAG_MAX_AGE_MS = 60_000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// --- reading what the system says ----------------------------------------------------------------

export function parseArgs(argv) {
  const options = { build: true, install: false, open: true, help: false, shortcuts: "once" };
  for (const arg of argv) {
    if (arg === "--rapido" || arg === "--no-build") options.build = false;
    else if (arg === "--instalar" || arg === "--install") options.install = true;
    else if (arg === "--sem-navegador" || arg === "--no-open") options.open = false;
    else if (arg === "--atalhos") options.shortcuts = "now";
    else if (arg === "--sem-atalhos") options.shortcuts = "never";
    else if (arg === "--ajuda" || arg === "--help" || arg === "-h") options.help = true;
    else throw new Error(`opcao desconhecida: ${arg} (veja --ajuda)`);
  }
  return options;
}

export function portOf(env = process.env) {
  const port = Number(env.ORBIS_PORT);
  return Number.isInteger(port) && port > 0 && port < 65536 ? port : DEFAULT_PORT;
}

/**
 * The processes listening on `port`, from `netstat -ano`. A listening socket is the one whose foreign
 * address has port 0, so this does not depend on the word for LISTENING (OUVINDO in Portuguese).
 */
export function parseNetstat(text, port) {
  const pids = new Set();
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*TCP\s+(\S+):(\d+)\s+\S+:0\s+\S+\s+(\d+)\s*$/i.exec(line);
    if (m && Number(m[2]) === port) pids.add(Number(m[3]));
  }
  return [...pids];
}

/** The image name of a process, from one `tasklist /FO CSV /NH` row ("node.exe","1234",…). */
export function parseTasklist(text) {
  const m = /^"([^"]+)"/m.exec(text);
  return m ? m[1] : null;
}

/** What a process is allowed to be for Orbis to stop it: Node running the hub (not the desktop app, not another program). */
export const isNodeProcess = (name) => name !== null && /^node(\.exe)?$/i.test(name.trim());

const run = (file, args) => execFileSync(file, args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
const tryRun = (file, args) => {
  try {
    return run(file, args);
  } catch {
    return "";
  }
};

export function listeningPids(port, platform = process.platform) {
  if (platform === "win32") return parseNetstat(tryRun("netstat", ["-ano"]), port);
  return tryRun("lsof", ["-ti", `tcp:${port}`, "-sTCP:LISTEN"])
    .split(/\s+/)
    .filter(Boolean)
    .map(Number);
}

export function processName(pid, platform = process.platform) {
  if (platform === "win32") return parseTasklist(tryRun("tasklist", ["/FI", `PID eq ${pid}`, "/FO", "CSV", "/NH"]));
  return tryRun("ps", ["-p", String(pid), "-o", "comm="]).trim() || null;
}

/** What answers on the port: an Orbis hub (its /health), nothing, or some other program. */
export async function probe(port, platform = process.platform, fetchImpl = fetch) {
  try {
    const res = await fetchImpl(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(2_000) });
    const body = await res.json().catch(() => null);
    if (res.ok && body && body.ok === true && typeof body.version === "string") return "orbis";
    return "other";
  } catch {
    return listeningPids(port, platform).length > 0 ? "other" : "free";
  }
}

// --- stopping and starting -----------------------------------------------------------------------

function kill(pid, platform = process.platform) {
  // Windows: the whole tree (the hub's bot processes go with it). Elsewhere: a polite SIGTERM.
  if (platform === "win32") tryRun("taskkill", ["/PID", String(pid), "/T", "/F"]);
  else {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      /* already gone */
    }
  }
}

async function waitFor(done, ms) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (await done()) return true;
    await sleep(250);
  }
  return done();
}

/** Stop the Orbis hub on `port`. Returns null when stopped, or why it was not. */
export async function stopHub(port, log = console.log, platform = process.platform) {
  const pids = listeningPids(port, platform);
  const names = pids.map((pid) => ({ pid, name: processName(pid, platform) }));
  const foreign = names.find((p) => !isNodeProcess(p.name));
  if (foreign) {
    return `o Orbis esta rodando dentro de ${foreign.name ?? "outro programa"} (PID ${foreign.pid}), que o Orbis nao encerra sozinho: feche esse programa (o app desktop, por exemplo) e rode de novo`;
  }
  writeFileSync(RESTART_FLAG, JSON.stringify(names.map((p) => p.pid)));
  for (const { pid } of names) {
    log(`Parando o Orbis que ja estava rodando (PID ${pid})...`);
    kill(pid, platform);
  }
  const freed = () => listeningPids(port, platform).length === 0;
  if (!(await waitFor(freed, 6_000)) && platform !== "win32") {
    for (const { pid } of names) {
      try {
        process.kill(pid, "SIGKILL");
      } catch {
        /* already gone */
      }
    }
  }
  if (!(await waitFor(freed, 10_000))) return `a porta ${port} continua ocupada depois de parar o Orbis`;
  return null;
}

/** The server `pid` of this window was stopped by a newer launcher (a restart), not by a crash or by the user. */
export function wasRestarted(pid, now = Date.now()) {
  try {
    if (now - statSync(RESTART_FLAG).mtimeMs > FLAG_MAX_AGE_MS) return false;
    return JSON.parse(readFileSync(RESTART_FLAG, "utf8")).includes(pid);
  } catch {
    return false;
  }
}

/** The token as the hub reads it (ORBIS_TOKEN, else the data directory's `token`), so `orbis open` is not misled by an old saved one. */
export function tokenFor(env = process.env) {
  if (env.ORBIS_TOKEN?.trim()) return env.ORBIS_TOKEN.trim();
  const dir = env.ORBIS_DATA_DIR?.trim() ? env.ORBIS_DATA_DIR.trim().replace(/^~(?=$|[\\/])/, os.homedir()) : path.join(os.homedir(), ".orbis");
  try {
    return readFileSync(path.join(dir, "token"), "utf8").trim() || null;
  } catch {
    return null;
  }
}

/**
 * The Orbis shortcuts (Desktop and Start menu, with the Orbis icon): a .bat file cannot carry an icon,
 * a shortcut can. Made on the first run (a note in the data folder keeps it from coming back after you
 * delete it) or when asked with --atalhos. Windows only; a failure is said, never fatal.
 */
export function ensureShortcuts({ mode = "once", env = process.env, log = console.log, platform = process.platform, run = tryRun } = {}) {
  if (platform !== "win32" || mode === "never") return false;
  const note = path.join(dataDirOf(env), "atalhos-criados");
  if (mode === "once" && existsSync(note)) return false;
  const output = run("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(HERE, "criar-atalhos.ps1")]);
  if (!/^Created /m.test(output)) {
    log("Nao consegui criar os atalhos com o icone do Orbis; rode Orbis-Atalhos.bat para ver o motivo.");
    return false;
  }
  mkdirSync(path.dirname(note), { recursive: true });
  writeFileSync(note, `${new Date().toISOString()}\n`);
  log("Criei o atalho Orbis (com o icone do Orbis) na area de trabalho e no menu Iniciar. Use o atalho no lugar do .bat.");
  return true;
}

function build(options, log) {
  const shell = process.platform === "win32"; // npm is npm.cmd there
  const npm = (args) => spawnSync("npm", args, { cwd: ROOT, stdio: "inherit", shell }).status === 0;
  if (options.install || !existsSync(path.join(ROOT, "node_modules"))) {
    log("Instalando as dependencias (npm install)...");
    if (!npm(["install"])) return "o npm install falhou";
  }
  if (options.build) {
    log("Compilando (npm run build)...");
    if (!npm(["run", "build"])) return "o npm run build falhou: o Orbis que ja estava rodando nao foi tocado";
  } else if (!existsSync(path.join(ROOT, "packages/cli/dist/index.js"))) {
    return "o Orbis ainda nao foi compilado: rode sem --rapido";
  }
  return null;
}

const HELP = `Orbis.bat - inicia o Orbis; se ele ja estiver rodando, reinicia.

  --rapido           nao compila antes de iniciar (use quando nada mudou)
  --instalar         roda o npm install antes
  --sem-navegador    nao abre o navegador
  --atalhos          cria os atalhos com o icone do Orbis (na area de trabalho e no menu Iniciar)
  --sem-atalhos      nao cria os atalhos (por padrao eles sao criados na primeira vez, no Windows)
  ORBIS_PORT         porta do Orbis (padrao ${DEFAULT_PORT})
`;

export async function main(argv, env = process.env, log = console.log) {
  let options;
  try {
    options = parseArgs(argv);
  } catch (err) {
    log(err.message);
    return 2;
  }
  if (options.help) {
    log(HELP);
    return 0;
  }
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major < 22 || (major === 22 && minor < 12)) {
    log(`O Orbis precisa do Node.js 22.12 ou mais novo; este e o ${process.versions.node}. Instale em https://nodejs.org`);
    return 1;
  }
  const port = portOf(env);

  ensureShortcuts({ mode: options.shortcuts, env, log });
  const failed = build(options, log);
  if (failed) {
    log(`Erro: ${failed}.`);
    return 1;
  }

  const found = await probe(port);
  if (found === "other") {
    const holder = listeningPids(port)
      .map((pid) => `${processName(pid) ?? "?"} (PID ${pid})`)
      .join(", ");
    log(
      `Erro: a porta ${port} esta ocupada por outro programa${holder ? `: ${holder}` : ""}, que nao e o Orbis. Feche-o, ou use outra porta (set ORBIS_PORT=7421).`,
    );
    return 1;
  }
  if (found === "orbis") {
    log(`O Orbis ja esta rodando na porta ${port}: reiniciando.`);
    const why = await stopHub(port, log);
    if (why) {
      log(`Erro: ${why}.`);
      return 1;
    }
  }

  const url = `http://127.0.0.1:${port}`;
  log(`Iniciando o Orbis em ${url}  (feche esta janela, ou Ctrl+C, para parar)\n`);
  const child = spawn(process.execPath, [path.join(ROOT, "packages/cli/dist/index.js"), "serve"], { cwd: ROOT, stdio: "inherit", env });
  let interrupted = false;
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
    process.on(signal, () => {
      interrupted = true;
      // At a Windows console Ctrl+C reaches the server by itself; elsewhere pass it on.
      if (process.platform !== "win32") child.kill(signal === "SIGINT" ? "SIGINT" : "SIGTERM");
    });
  }
  const ended = new Promise((resolve) => child.on("exit", (code, signal) => resolve(code ?? (signal ? 1 : 0))));
  let alive = true;
  void ended.then(() => (alive = false));

  // When the server answers, the restart is over; open the web app already signed in.
  void (async () => {
    let up = false;
    for (let i = 0; i < 120 && alive && !up; i++) {
      up = (await probe(port)) === "orbis";
      if (!up) await sleep(500);
    }
    if (!up) return;
    rmSync(RESTART_FLAG, { force: true });
    if (!options.open) return;
    const token = tokenFor(env);
    const opener = spawn(process.execPath, [path.join(ROOT, "packages/cli/dist/index.js"), "open"], {
      cwd: ROOT,
      stdio: "ignore",
      detached: true,
      env: { ...env, ORBIS_URL: url, ...(token ? { ORBIS_TOKEN: token } : {}) },
    });
    opener.on("error", () => log(`Abra ${url} no navegador.`));
    opener.unref();
  })();

  const code = await ended;
  if (wasRestarted(child.pid)) {
    log("O Orbis foi reiniciado em outra janela: esta pode ser fechada.");
    return 0;
  }
  log(interrupted ? "\nOrbis parado." : `\nO Orbis parou (codigo ${code}).`);
  return interrupted ? 0 : code;
}

/** Run as a program (and not when a test imports it); realpath, so a drive letter typed in lower case still matches on Windows. */
function isMain() {
  try {
    return process.argv[1] !== undefined && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isMain()) {
  process.exitCode = await main(process.argv.slice(2));
}
