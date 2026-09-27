// Input/output handles, injected so commands run in-process under test.
import type { Readable, Writable } from "node:stream";

export interface Io {
  stdout: Writable;
  stderr: Writable;
  stdin: Readable;
  env: Record<string, string | undefined>;
  /** True when stdin and stdout are a terminal (interactive prompts allowed). */
  interactive: boolean;
  color: boolean;
}

export function processIo(): Io {
  return {
    stdout: process.stdout,
    stderr: process.stderr,
    stdin: process.stdin,
    env: process.env,
    interactive: Boolean(process.stdin.isTTY && process.stdout.isTTY),
    color: Boolean(process.stdout.isTTY) && !process.env.NO_COLOR,
  };
}

export function paint(io: Io) {
  const wrap = (code: string) => (s: string) => (io.color ? `\x1b[${code}m${s}\x1b[0m` : s);
  return { dim: wrap("2"), bold: wrap("1"), red: wrap("31"), green: wrap("32"), yellow: wrap("33"), cyan: wrap("36") };
}

export function out(io: Io, line = ""): void {
  io.stdout.write(line + "\n");
}

export function err(io: Io, line: string): void {
  io.stderr.write(line + "\n");
}

export function json(io: Io, value: unknown): void {
  io.stdout.write(JSON.stringify(value, null, 2) + "\n");
}

export class UsageError extends Error {}
