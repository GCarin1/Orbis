// Which subscription CLIs and local model servers this machine has
// (specs/agent-runtimes: health check).
import { execFile } from "node:child_process";
import type { LocalModelServer, RuntimeHealth } from "@orbis/shared";
import { launchCommand, resolveExecutable } from "./process.js";

export type { RuntimeHealth };

/** Each CLI brain with the executable names it answers to, most specific first. */
export const CLI_EXECUTABLES: Array<{ kind: RuntimeHealth["kind"]; executables: string[] }> = [
  { kind: "claude-code", executables: ["claude"] },
  { kind: "codex", executables: ["codex"] },
  { kind: "gemini-cli", executables: ["gemini"] },
  // Cursor's installer names it `agent`; older installs call it `cursor-agent`.
  { kind: "cursor", executables: ["cursor-agent", "agent"] },
];

function version(file: string): Promise<string | null> {
  return new Promise((resolve) => {
    let launch: { command: string; args: string[] };
    try {
      launch = launchCommand(file, ["--version"]);
    } catch {
      resolve(null);
      return;
    }
    execFile(launch.command, launch.args, { timeout: 10_000, windowsHide: true }, (err, stdout, stderr) => {
      const line = `${stdout}${stderr}`.split("\n").map((l) => l.trim()).find(Boolean) ?? null;
      resolve(err && !line ? null : line);
    });
  });
}

/** The first of `names` found on PATH. */
export function findExecutable(names: string[], envPath = process.env.PATH ?? ""): { executable: string; path: string } | null {
  for (const name of names) {
    const file = resolveExecutable(name, envPath);
    if (file) return { executable: name, path: file };
  }
  return null;
}

export async function runtimeHealth(
  executables = CLI_EXECUTABLES,
  envPath = process.env.PATH ?? "",
): Promise<RuntimeHealth[]> {
  return Promise.all(
    executables.map(async ({ kind, executables: names }) => {
      const found = findExecutable(names, envPath);
      return {
        kind,
        executable: found?.executable ?? names[0]!,
        found: found !== null,
        path: found?.path ?? null,
        version: found ? await version(found.path) : null,
      };
    }),
  );
}

/** Ask each local model server for its models (OpenAI-compatible `GET /models`). */
export async function localModelServers(
  servers: Array<{ kind: LocalModelServer["kind"]; baseUrl: string }>,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 2500,
): Promise<LocalModelServer[]> {
  return Promise.all(
    servers.map(async ({ kind, baseUrl }) => {
      const base = baseUrl.replace(/\/+$/, "");
      try {
        const res = await fetchImpl(`${base}/models`, { signal: AbortSignal.timeout(timeoutMs) });
        if (!res.ok) return { kind, baseUrl: base, reachable: true, models: [], error: `GET ${base}/models answered HTTP ${res.status}` };
        const body = (await res.json()) as { data?: Array<{ id?: unknown }> };
        const models = (body.data ?? []).map((m) => m.id).filter((id): id is string => typeof id === "string").sort();
        return { kind, baseUrl: base, reachable: true, models, error: null };
      } catch (err) {
        const reason = err instanceof Error && err.name === "TimeoutError" ? "no answer" : "not reachable";
        return { kind, baseUrl: base, reachable: false, models: [], error: `${reason} at ${base}` };
      }
    }),
  );
}
