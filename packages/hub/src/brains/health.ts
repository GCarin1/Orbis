// Which subscription CLIs this machine has (specs/agent-runtimes: health check).
import { execFile } from "node:child_process";
import { resolveExecutable } from "./process.js";

export interface RuntimeHealth {
  kind: "claude-code" | "codex" | "gemini-cli";
  executable: string;
  found: boolean;
  path: string | null;
  version: string | null;
}

export const CLI_EXECUTABLES: Array<{ kind: RuntimeHealth["kind"]; executable: string }> = [
  { kind: "claude-code", executable: "claude" },
  { kind: "codex", executable: "codex" },
  { kind: "gemini-cli", executable: "gemini" },
];

function version(file: string): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(file, ["--version"], { timeout: 10_000, windowsHide: true }, (err, stdout, stderr) => {
      const line = `${stdout}${stderr}`.split("\n").map((l) => l.trim()).find(Boolean) ?? null;
      resolve(err && !line ? null : line);
    });
  });
}

export async function runtimeHealth(
  executables = CLI_EXECUTABLES,
  envPath = process.env.PATH ?? "",
): Promise<RuntimeHealth[]> {
  return Promise.all(
    executables.map(async ({ kind, executable }) => {
      const file = resolveExecutable(executable, envPath);
      return { kind, executable, found: file !== null, path: file, version: file ? await version(file) : null };
    }),
  );
}
