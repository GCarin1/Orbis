// Everything a route or a capability module needs, wired once by createHub.
import type { EventBus } from "./bus.js";
import type { HubConfig } from "./config.js";
import type { ComputerManager } from "./computer/manager.js";
import type { BrowserService } from "./computer/browser.js";
import type { Database } from "./db/index.js";
import type { BotsRepo } from "./repos/bots.js";
import type { ConversationsRepo, ItemsRepo } from "./repos/conversations.js";
import type { MemoryRepo } from "./repos/memory.js";
import type { BrainSessionsRepo, RunsRepo } from "./repos/runs.js";
import type { RunEngine } from "./runs/engine.js";
import type { BotService } from "./services/bots.js";
import type { ConversationService } from "./services/conversations.js";
import type { Timeline } from "./services/timeline.js";
import type { BrainRegistry } from "./brains/types.js";
import type { ApprovalService } from "./approvals/service.js";
import type { DraftService } from "./approvals/drafts.js";
import type { ToolGateway } from "./tools/gateway.js";
import type { ToolRegistry } from "./tools/registry.js";
import type { ApprovalsRepo } from "./repos/approvals.js";

/** Where the engine looks up a bot's secret by name; the secrets capability registers the vault. */
export class SecretResolvers {
  private readonly resolvers: Array<(botId: string, name: string) => string | null> = [];

  register(resolver: (botId: string, name: string) => string | null): void {
    this.resolvers.push(resolver);
  }

  resolve(botId: string, name: string): string | null {
    for (const resolve of this.resolvers) {
      const value = resolve(botId, name);
      if (value !== null) return value;
    }
    return null;
  }
}

export interface HubContext {
  config: HubConfig;
  db: Database;
  bus: EventBus;
  repos: {
    bots: BotsRepo;
    conversations: ConversationsRepo;
    items: ItemsRepo;
    runs: RunsRepo;
    sessions: BrainSessionsRepo;
    memory: MemoryRepo;
    approvals: ApprovalsRepo;
  };
  brains: BrainRegistry;
  computer: ComputerManager;
  browser: BrowserService;
  timeline: Timeline;
  engine: RunEngine;
  botService: BotService;
  conversationService: ConversationService;
  secretResolvers: SecretResolvers;
  tools: ToolRegistry;
  approvals: ApprovalService;
  drafts: DraftService;
  gateway: ToolGateway;
  /** The URL the hub listens on (known after listen), for CLI brains reaching /mcp. */
  url(): string;
}
