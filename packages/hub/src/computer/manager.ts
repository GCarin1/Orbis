// One computer per bot behind a provider interface (ADR 0005).
// Change 0001 ships the workspace directory every brain runs in; the tools,
// the docker provider and the live view arrive with the computer change.
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";

export interface ComputerProvider {
  readonly kind: string;
  /** Destroy everything the provider holds for the bot (container, volume, profile). */
  destroy(botId: string): Promise<void>;
}

export class ComputerManager {
  private readonly providers: ComputerProvider[];

  constructor(
    private readonly dataDir: string,
    providers: ComputerProvider[] = [],
  ) {
    this.providers = providers;
  }

  /** Root directory of everything a bot owns on disk. */
  botDir(botId: string): string {
    return path.join(this.dataDir, "bots", botId);
  }

  workspaceDir(botId: string): string {
    return path.join(this.botDir(botId), "workspace");
  }

  /** Create the bot's workspace if missing and return its path. */
  ensureWorkspace(botId: string): string {
    const dir = this.workspaceDir(botId);
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    return dir;
  }

  /** Destroy the bot's computer on every provider, then its directories. */
  async destroy(botId: string): Promise<void> {
    for (const provider of this.providers) {
      await provider.destroy(botId);
    }
    rmSync(this.botDir(botId), { recursive: true, force: true });
  }
}
