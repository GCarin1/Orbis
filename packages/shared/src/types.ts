// Domain types shared by the hub, the CLI and the web app.
// The shapes mirror `.doctrina/contracts/hub-surface.md` (Resource shapes).

export const BOT_STATES = ["idle", "thinking", "working", "waiting", "blocked", "done"] as const;
export type BotState = (typeof BOT_STATES)[number];

export const BRAIN_KINDS = [
  "mock",
  "anthropic",
  "openai",
  "claude-code",
  "codex",
  "gemini-cli",
  "custom-cli",
] as const;
export type BrainKind = (typeof BRAIN_KINDS)[number];

/** Brains that run as a child process and log in with the user's own subscription. */
export const CLI_BRAIN_KINDS: readonly BrainKind[] = ["claude-code", "codex", "gemini-cli", "custom-cli"];

export interface Brain {
  kind: BrainKind;
  /** Model id or alias understood by the brain (e.g. "sonnet", "gpt-5", "llama3.2"). */
  model?: string;
  /** Base URL for OpenAI-compatible and Anthropic endpoints. */
  baseUrl?: string;
  /** Name of the bot secret holding the API key, for API brains. */
  apiKeySecret?: string;
  /** Executable for CLI brains; defaults to the brain's usual command. */
  command?: string;
  /** Arguments placed before the adapter's own arguments (custom-cli: the whole argv). */
  args?: string[];
  maxSteps?: number;
  timeoutSec?: number;
}

export type PolicyDecision = "allow" | "ask" | "deny";

export interface PolicyRule {
  /** Tool name or glob with `*`, e.g. `computer.*`. */
  tool: string;
  decision: PolicyDecision;
  /** A locked rule is never overridden by a grant, a description or a brain. */
  locked?: boolean;
}

export interface Policy {
  rules: PolicyRule[];
  /** Tool names the user answered "allow always" for. */
  grants: string[];
}

export type ComputerProviderKind = "local" | "docker";

export interface ComputerConfig {
  enabled: boolean;
  provider?: ComputerProviderKind;
  image?: string;
  cpus?: number;
  memoryMb?: number;
  hibernateAfterMin?: number;
}

export interface Avatar {
  initials: string;
  color: string;
}

export interface LastMessage {
  text: string;
  at: string;
}

export interface Bot {
  id: string;
  handle: string;
  name: string;
  role: string;
  description: string;
  avatar: Avatar;
  brain: Brain;
  policy: Policy;
  computer: ComputerConfig;
  /** Tool allowlist (names or globs such as `computer.*`); `["*"]` offers every registered tool. */
  tools: string[];
  /** Account skill allowlist; `["*"]` offers every account skill. */
  skills: string[];
  spendCapUsd: number | null;
  capIncludesSubscription: boolean;
  pinned: boolean;
  hidden: boolean;
  state: BotState;
  lastMessage: LastMessage | null;
  createdAt: string;
  updatedAt: string;
}

export type ConversationKind = "direct" | "group";

export interface Conversation {
  id: string;
  kind: ConversationKind;
  title: string;
  /** Member bot ids, in order. */
  members: string[];
  leadBotId: string | null;
  createdAt: string;
  lastItemAt: string | null;
}

export type ItemKind = "message" | "event" | "card";
export type AuthorType = "user" | "bot" | "system";

export interface Author {
  type: AuthorType;
  id: string | null;
}

export type CardType = "approval" | "draft" | "handoff" | "secret-request" | "routine";

export interface Card {
  type: CardType;
  state: string;
  data: Record<string, unknown>;
}

export interface TimelineEvent {
  type: string;
  data: Record<string, unknown>;
}

export interface TimelineItem {
  id: string;
  conversationId: string;
  kind: ItemKind;
  author: Author;
  text: string;
  parentId: string | null;
  mentions: string[];
  attachments: string[];
  reactions: Record<string, number>;
  runId: string | null;
  card?: Card;
  event?: TimelineEvent;
  createdAt: string;
  updatedAt: string;
}

export const RUN_STATUSES = ["queued", "running", "waiting", "done", "failed", "cancelled"] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

export type RunTriggerType = "message" | "handoff" | "mention" | "routine" | "webhook" | "api";

export interface RunTrigger {
  type: RunTriggerType;
  ref: string | null;
}

export type StepType = "thinking" | "text" | "tool_call" | "tool_result";

export interface Step {
  type: StepType;
  at: string;
  text?: string;
  tool?: string;
  callId?: string;
  input?: unknown;
  output?: string;
  isError?: boolean;
}

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  costUsd: number;
  /** True when the cost is covered by a CLI subscription rather than billed per token. */
  subscription: boolean;
}

export interface Run {
  id: string;
  botId: string;
  conversationId: string | null;
  trigger: RunTrigger;
  depth: number;
  status: RunStatus;
  input: string;
  skill: string | null;
  steps: Step[];
  reply: string | null;
  usage: Usage;
  error: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    fields?: Record<string, string>;
  };
}

export function emptyUsage(): Usage {
  return { inputTokens: 0, outputTokens: 0, cachedTokens: 0, costUsd: 0, subscription: false };
}

export type ApprovalStatus = "pending" | "approved" | "denied" | "expired";
export type ApprovalDecision = "allow_once" | "allow_always" | "deny";

export interface Approval {
  id: string;
  runId: string;
  botId: string;
  conversationId: string | null;
  itemId: string | null;
  tool: string;
  /** Tool input with secret values masked. */
  input: unknown;
  reason: string | null;
  status: ApprovalStatus;
  decision: ApprovalDecision | null;
  note: string | null;
  createdAt: string;
  decidedAt: string | null;
}

export type DraftChannel = "email" | "chat" | "social" | "webhook";

export interface DraftFields {
  channel: DraftChannel;
  to: string;
  subject?: string;
  body: string;
  /** Destination of a `webhook` draft. */
  url?: string;
}

export const MEMORY_KINDS = ["preference", "role", "fact", "summary"] as const;
export type MemoryKind = (typeof MEMORY_KINDS)[number];

export interface MemoryEntry {
  id: string;
  /** Null for a team-level entry shared by every bot. */
  botId: string | null;
  kind: MemoryKind;
  text: string;
  source: string;
  createdAt: string;
  updatedAt: string;
}

/** Data of a `handoff` card (specs/handoff). */
export interface HandoffCardData {
  from: string;
  to: string;
  task: string;
  context: string | null;
  returnResult: boolean;
  receiverRunId: string | null;
  returnRunId?: string | null;
  error?: string | null;
  [key: string]: unknown;
}
