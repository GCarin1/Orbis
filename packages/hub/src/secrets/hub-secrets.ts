// Hub-wide secrets — a transcription key, the tokens of connected MCP servers —
// encrypted with the vault's key into the settings table (specs/secrets). The
// API reports whether one is set, never its value.
import type { SettingsRepo } from "../repos/settings.js";
import type { Vault } from "./vault.js";

/** Bot ids start with `bot_`: this owner never collides with a bot's own secrets. */
const OWNER = "hub";

export class HubSecrets {
  constructor(
    private readonly settings: SettingsRepo,
    private readonly vault: Vault,
  ) {}

  private key(name: string): string {
    return `secret:${name}`;
  }

  set(name: string, value: string): void {
    this.settings.set(this.key(name), this.vault.encrypt(OWNER, name, value));
  }

  get(name: string): string | null {
    const stored = this.settings.get(this.key(name));
    if (!stored) return null;
    try {
      return this.vault.decrypt(OWNER, name, stored);
    } catch {
      return null;
    }
  }

  has(name: string): boolean {
    return this.get(name) !== null;
  }

  delete(name: string): void {
    this.settings.delete(this.key(name));
  }
}
