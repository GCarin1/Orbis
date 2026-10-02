// The login token of the Orbis hub (the logic behind Orbis-Token.bat).
//
//   node scripts/windows/token.mjs [--novo] [--sim] [--sem-copiar]
//
// The hub keeps its API token in `<data dir>/token` (the data dir is ORBIS_DATA_DIR, else ~/.orbis) and
// creates it when it starts for the first time; the web app asks for it at the login screen. This shows
// it, creating it first when it does not exist, in the format the hub writes, and copies it to the
// clipboard. --novo replaces it (after asking, unless --sim): the hub reads it at startup, so restart it.
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";

const nonEmpty = (value) => (value && value.trim() ? value.trim() : undefined);

/** Where the hub keeps its data (ORBIS_DATA_DIR, with `~` expanded, else ~/.orbis). */
export function dataDirOf(env = process.env, home = os.homedir()) {
  const configured = nonEmpty(env.ORBIS_DATA_DIR);
  return configured ? path.resolve(configured.replace(/^~(?=$|[\\/])/, home)) : path.join(home, ".orbis");
}

/** A new token, the way the hub makes one: 32 random bytes in base64url. */
export const newToken = (bytes = randomBytes) => bytes(32).toString("base64url");

/**
 * The token to log in with. `created`: there was none and one was made; `replaced`: `rotate` asked for
 * a new one; `fromEnv`: ORBIS_TOKEN decides (the hub ignores the file), so nothing is written.
 */
export function ensureToken({ env = process.env, home = os.homedir(), rotate = false, bytes = randomBytes } = {}) {
  const file = path.join(dataDirOf(env, home), "token");
  const fromEnv = nonEmpty(env.ORBIS_TOKEN);
  if (fromEnv) return { token: fromEnv, file, created: false, replaced: false, fromEnv: true };
  const current = existsSync(file) ? nonEmpty(readFileSync(file, "utf8")) : undefined;
  if (current && !rotate) return { token: current, file, created: false, replaced: false, fromEnv: false };
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const token = newToken(bytes);
  writeFileSync(file, `${token}\n`, { mode: 0o600 });
  try {
    chmodSync(file, 0o600);
  } catch {
    /* Windows has no file modes */
  }
  return { token, file, created: current === undefined, replaced: current !== undefined, fromEnv: false };
}

/** The token a former `orbis login` saved, which the CLI prefers over the data directory's. */
export function savedLoginToken(env = process.env, home = os.homedir()) {
  const base = nonEmpty(env.XDG_CONFIG_HOME) ?? path.join(home, ".config");
  try {
    return nonEmpty(JSON.parse(readFileSync(path.join(base, "orbis", "config.json"), "utf8")).token) ?? null;
  } catch {
    return null;
  }
}

function copy(text) {
  if (process.platform !== "win32") return false;
  return spawnSync("clip", { input: text, windowsHide: true }).status === 0;
}

export async function main(argv, env = process.env, log = console.log) {
  const known = new Set(["--novo", "--sim", "--sem-copiar", "--ajuda", "--help"]);
  const bad = argv.find((arg) => !known.has(arg));
  if (bad || argv.includes("--ajuda") || argv.includes("--help")) {
    log(`${bad ? `opcao desconhecida: ${bad}\n\n` : ""}Orbis-Token.bat - mostra o token de login do Orbis (cria se nao existir).

  --novo         troca por um token novo (pergunta antes; --sim nao pergunta)
  --sem-copiar   nao copia o token para a area de transferencia`);
    return bad ? 2 : 0;
  }
  const rotate = argv.includes("--novo");
  if (rotate && !nonEmpty(env.ORBIS_TOKEN) && !argv.includes("--sim")) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question("Gerar um token NOVO? O atual deixa de valer assim que o Orbis for reiniciado. (s/N) ");
    rl.close();
    if (!/^s/i.test(answer.trim())) {
      log("Nada foi alterado.");
      return 0;
    }
  }
  const result = ensureToken({ env, rotate });
  const port = Number(env.ORBIS_PORT) > 0 ? Number(env.ORBIS_PORT) : 7420;
  if (result.fromEnv) log("A variavel ORBIS_TOKEN esta definida e vale mais que o arquivo: este e o token dela (para trocar, mude a variavel).");
  else if (result.created) log(`Token criado em ${result.file}`);
  else if (result.replaced) log(`Token NOVO gravado em ${result.file}. Reinicie o Orbis (Orbis.bat) para ele valer.`);
  else log(`Token do Orbis (arquivo ${result.file}):`);
  log(`\n${result.token}\n`);
  log(`Tela de login do Orbis: cole o token. Ou abra ja logado:\nhttp://127.0.0.1:${port}/#token=${result.token}\n`);
  if (!argv.includes("--sem-copiar")) log(copy(result.token) ? "O token foi copiado: e so colar (Ctrl+V)." : "");
  const saved = savedLoginToken(env);
  if (saved && saved !== result.token) {
    log(
      "Aviso: o comando orbis login guardou outro token em ~/.config/orbis/config.json, que o terminal usa antes deste. Rode: orbis login --token <o token acima>",
    );
  }
  return 0;
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
