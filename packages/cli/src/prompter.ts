// Line input shared by the interactive chat and the inline approval prompt.
import { createInterface, type Interface } from "node:readline";
import type { Io } from "./io.js";

export class Prompter {
  private readonly rl: Interface;
  private readonly queue: string[] = [];
  private waiting: ((line: string | null) => void) | null = null;
  private closed = false;

  constructor(private readonly io: Io) {
    this.rl = createInterface({ input: io.stdin, crlfDelay: Infinity, terminal: false });
    this.rl.on("line", (line) => {
      if (this.waiting) {
        const resolve = this.waiting;
        this.waiting = null;
        resolve(line);
      } else {
        this.queue.push(line);
      }
    });
    this.rl.on("close", () => {
      this.closed = true;
      this.waiting?.(null);
      this.waiting = null;
    });
  }

  /** Print the prompt and resolve with the next line, or null when input ended. */
  ask(prompt: string): Promise<string | null> {
    this.io.stdout.write(prompt);
    const queued = this.queue.shift();
    if (queued !== undefined) return Promise.resolve(queued);
    if (this.closed) return Promise.resolve(null);
    return new Promise((resolve) => (this.waiting = resolve));
  }

  close(): void {
    this.rl.close();
  }
}
