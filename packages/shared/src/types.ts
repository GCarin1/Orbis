// Domain types shared by the hub, the CLI and the web app.
// The shapes mirror `.doctrina/contracts/hub-surface.md` (Resource shapes).
import type { AvatarShape } from "./handles.js";

export const BOT_STATES = ["idle", "thinking", "working", "waiting", "blocked", "done"] as const;
export type BotState = (typeof BOT_STATES)[number];

export const BRAIN_KINDS = [
  "mock",
  "anthropic",
  "openai",
  "claude-code",
  "codex",
  "gemini-cli",
  "cursor",
  "ollama",
  "lmstudio",
  "custom-cli",
  "chat-http",
] as const;
export type BrainKind = (typeof BRAIN_KINDS)[number];

/**
 * Settings of the `chat-http` brain: a chat orchestrator reached over HTTPS
 * with a Bearer token, its request posted as `multipart/form-data` with one
 * `data` field (the format a browser's "Copy as cURL" shows). The address and
 * the token are the user's: the address goes in `baseUrl`, the token in a
 * bot secret named by `apiKeySecret`; neither is ever written in Orbis's code.
 */
export interface ChatHttpOptions {
  /** `agent.agentId` of the request (default "chat-corporativo"). */
  agentId?: string;
  /** `agent.version` of the request (default "1.0.0"). */
  agentVersion?: string;
  /** `config.temperature` (default 0.25). */
  temperature?: number;
  /** `config.maxTokens` (default 64000). */
  maxTokens?: number;
  /** An `Origin` header, for servers that check it. */
  origin?: string;
  /**
   * Where the chats' history is read (`GET <it>?page=1…` lists them, `GET <it>/<chat id>`
   * reads one); default `history/chats` beside the chat address.
   */
  historyUrl?: string;
  /**
   * Give each new chat a title, as the browser does (`POST <history>/<chat id>/generate-title`
   * with the bot's name and the task); default true. It costs one model call per new chat.
   */
  titles?: boolean;
  /**
   * Headers the browser sent besides the token and `Origin` (see `CHAT_HTTP_HEADER_NAMES`), for a
   * server or a firewall that refuses a request without them (HTTP 403).
   */
  headers?: Record<string, string>;
  /**
   * How the requests are made: `curl` (the system's curl program: HTTP/2 and the TLS of a browser-like
   * client, which firewalls such as Cloudflare accept) or `fetch` (Node's own). Default: curl when it
   * is installed (Windows 10 and later have it), else fetch.
   */
  transport?: "curl" | "fetch";
  /**
   * Plain chat: send only the conversation, as the browser does — the bot's name, role and
   * description, its memories and the messages — without Orbis's instructions and tools. For a
   * company firewall that reads each message and blocks the tool instructions (a shell, file paths,
   * placeholders) as an attack. The bot then uses no tools.
   */
  plain?: boolean;
  /** The curl program to use (a path), when not the one on PATH — say, the Git Bash curl that works in a terminal. */
  curl?: string;
  /**
   * The proxy curl goes through: a URL, or `direct` for none. Default: the environment's
   * (HTTPS_PROXY), else Windows' own (its Internet settings, a PAC script included).
   */
  proxy?: string;
}

/** What `POST /api/v1/bots/:id/chat-check` found: each way to reach a `chat-http` API, and whether its firewall let it through. */
export interface ChatConnectionCheck {
  /** The address tried (a cheap GET: the chats' history, or the chat address). */
  url: string;
  /** The proxies found: Windows' own for that address, and the environment's. */
  proxies: { windows: string | null; env: string | null };
  results: Array<{
    transport: "curl" | "fetch";
    /** The curl program, for curl. */
    curl: string | null;
    /** A proxy URL, `direct`, or null for curl's default (the environment's). */
    proxy: string | null;
    /** ok: answered; token: passed the firewall, the token was refused; reached: passed, another answer; blocked: the firewall refused; error: no answer. */
    verdict: "ok" | "token" | "reached" | "blocked" | "error";
    status: number | null;
    detail: string;
    ms: number;
  }>;
}

/** The headers of a pasted cURL that Orbis keeps and sends in `ChatHttpOptions.headers` (never a cookie, a key or `Authorization`). */
export const CHAT_HTTP_HEADER_NAMES = [
  "user-agent",
  "accept-language",
  "referer",
  "cache-control",
  "pragma",
  "priority",
  "sec-ch-ua",
  "sec-ch-ua-mobile",
  "sec-ch-ua-platform",
  "sec-fetch-dest",
  "sec-fetch-mode",
  "sec-fetch-site",
] as const;

/** Whether a bot's `chat-http` token is saved and when it expires (`GET /api/v1/bots/:id/chat-token`); the token itself never leaves the vault. */
export interface ChatTokenStatus {
  saved: boolean;
  /** When the saved token's `exp` says it stops working, or null when it names none. */
  expiresAt: string | null;
  expired: boolean;
  /** Where the token the bot uses comes from: the one its chat API's bots share, or its own (from before tokens were shared). */
  source?: "shared" | "bot" | null;
}

/** The hub-secret name prefix of the token shared by every `chat-http` bot of one chat API (`<prefix><origin>`). */
export const CHAT_HTTP_SHARED_TOKEN = "chat-http-token:";

/** One chat API (`GET /api/v1/chat-http/tokens`): its address's origin, its shared token, and the bots that use it. */
export interface ChatTokenGroup {
  origin: string;
  token: ChatTokenStatus;
  bots: Array<{ id: string; name: string; handle: string }>;
}

/** The default `chat-http` model (`config.modelId`). */
export const CHAT_HTTP_DEFAULT_MODEL = "claude-4-6-opus";
/** The bot secret that holds a `chat-http` brain's Bearer token, unless the brain names another. */
export const CHAT_HTTP_TOKEN_SECRET = "CHAT_BEARER_TOKEN";

/** Brains that run as a child process and log in with the user's own subscription. */
export const CLI_BRAIN_KINDS: readonly BrainKind[] = ["claude-code", "codex", "gemini-cli", "cursor", "custom-cli"];

/** Brains served by a model server on this machine, through the OpenAI-compatible adapter. */
export const LOCAL_BRAIN_KINDS: readonly BrainKind[] = ["ollama", "lmstudio"];

export interface Brain {
  kind: BrainKind;
  /** Model id or alias understood by the brain (e.g. "sonnet", "gpt-5", "llama3.2"). */
  model?: string;
  /** Base URL for OpenAI-compatible and Anthropic endpoints (ollama and lmstudio default to their local address). */
  baseUrl?: string;
  /** Name of the bot secret holding the API key, for API brains. */
  apiKeySecret?: string;
  /**
   * How an OpenAI-compatible brain sends its key: `bearer` (`Authorization: Bearer <key>`, the default)
   * or `api-key` (an `api-key: <key>` header, as Azure OpenAI and gateways built like it ask).
   */
  apiKeyHeader?: "bearer" | "api-key";
  /** Executable for CLI brains; defaults to the brain's usual command. */
  command?: string;
  /** Arguments placed before the adapter's own arguments (custom-cli: the whole argv). */
  args?: string[];
  maxSteps?: number;
  timeoutSec?: number;
  /** `chat-http` only: the orchestrator's request settings. */
  chat?: ChatHttpOptions;
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

/**
 * Where a bot's computer lives (specs/computer): `local`, a folder of its own
 * on the hub's machine; `host`, the user's own machine in a folder they
 * choose, with a visible browser; `docker`, a container with a desktop.
 */
export type ComputerProviderKind = "local" | "host" | "docker";
export const COMPUTER_PROVIDERS: ComputerProviderKind[] = ["local", "host", "docker"];

export interface ComputerConfig {
  enabled: boolean;
  provider?: ComputerProviderKind;
  /** `host` only: the folder the bot works in (absolute; default the user's home). */
  hostDir?: string;
  image?: string;
  cpus?: number;
  memoryMb?: number;
  hibernateAfterMin?: number;
}

export interface Avatar {
  initials: string;
  color: string;
  /** One of AVATAR_SHAPES; drawn with two eyes (specs/web-app). */
  shape: AvatarShape;
}

export interface LastMessage {
  text: string;
  at: string;
}

export const INITIATIVE_FREQUENCIES = ["rare", "normal", "often"] as const;
export type InitiativeFrequency = (typeof INITIATIVE_FREQUENCIES)[number];

/**
 * A bot writing to the user on its own (specs/bots: initiative): asking for a task when it has been quiet
 * for a while, sharing an insight, or alerting the user to what its MCP servers announce.
 */
export interface BotInitiative {
  enabled: boolean;
  /** rare: once a day at most, after 12 h of quiet; normal: twice, after 4 h; often: four times, after 2 h. */
  frequency: InitiativeFrequency;
  /** Also write when an MCP server the bot has announces an update (change 0061). */
  mcpUpdates: boolean;
}

/** What the user set for every bot's initiative (Settings). */
export interface InitiativeSettings {
  /** Off: no bot writes on its own, whatever its own switch says. */
  enabled: boolean;
  /** Quiet hours, "HH:MM" in `timezone`, when no bot writes on its own. Equal times: none. */
  quietStart: string;
  quietEnd: string;
  timezone: string;
}

export interface Bot {
  id: string;
  handle: string;
  name: string;
  role: string;
  description: string;
  avatar: Avatar;
  brain: Brain;
  /** The bot this one reports to (its manager), or null at the top of the team. */
  reportsTo: string | null;
  /** The squad this bot belongs to (specs/squads), or null. */
  squadId: string | null;
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
  /** Whether the bot writes to the user on its own; off unless the user turns it on. */
  initiative?: BotInitiative;
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
  /** A group's description: what it is for, shown in its info and read by its bots. */
  description: string;
  /** A group's photo (a small `data:image/…` URL), or null for its members' faces. */
  photo: string | null;
  /** A muted group raises no "reported back" notification and shows its unread count in gray. */
  muted: boolean;
  createdAt: string;
  lastItemAt: string | null;
}

/** A code that pairs a phone with the hub (the Android app trades it for the token, once). */
export interface PairingCode {
  code: string;
  expiresAt: string;
  /** Whether the hub takes connections from the network; else the phone cannot reach it. */
  listening: boolean;
  /** The hub's addresses on this computer's network cards, for the phone. */
  addresses: string[];
}

/** A link found in a conversation's messages (its "media, links and docs"). */
export interface ConversationLink {
  url: string;
  itemId: string;
  author: Author;
  createdAt: string;
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

/** A file sent in a conversation (specs/conversations): by the user, or by a bot that made it. */
export interface ConversationFile {
  id: string;
  conversationId: string;
  name: string;
  mime: string;
  size: number;
  author: Author;
  /** The message that carries it; null while it is uploaded and not yet sent. */
  itemId: string | null;
  createdAt: string;
}

export interface TimelineItem {
  id: string;
  conversationId: string;
  kind: ItemKind;
  author: Author;
  text: string;
  parentId: string | null;
  mentions: string[];
  /** The ids of the files the message carries. */
  attachments: string[];
  /** Those files, when the message carries any. */
  files?: ConversationFile[];
  reactions: Record<string, number>;
  runId: string | null;
  card?: Card;
  event?: TimelineEvent;
  createdAt: string;
  updatedAt: string;
}

export const RUN_STATUSES = ["queued", "running", "waiting", "done", "failed", "cancelled"] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

/** `report`: a bot's follow-up once every task it handed off in one run has ended. */
export type RunTriggerType = "message" | "handoff" | "mention" | "report" | "routine" | "webhook" | "api" | "hiring" | "initiative";

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
  /**
   * The id of the run that started this piece of work — the run of the user's
   * message or the routine; handoffs, reports and mentions carry it on, so
   * the chain they form can be bounded (specs/conversations).
   */
  chainId: string;
  /** The failed or cancelled run the user asked to try again with this one. */
  retryOf?: string | null;
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
  /** The sender's single follow-up once every handoff of its run has ended. */
  reportRunId?: string | null;
  error?: string | null;
  [key: string]: unknown;
}

export type ComputerState = "stopped" | "running" | "hibernated";

/** What clients see of a bot's computer (`GET /bots/:id/computer`, `computer.updated`). */
export interface ComputerStatus {
  botId: string;
  enabled: boolean;
  provider: ComputerProviderKind;
  status: ComputerState;
  /** The user holds the computer: the bot's tool calls wait. */
  takeover: boolean;
  /** Path of the noVNC page when the provider has a desktop, else null (screenshots only). */
  vncPath: string | null;
  lastUsedAt: string | null;
  /** When the latest browser screenshot was taken, for the live view. */
  screenshotAt: string | null;
}

// --- skills (specs/skills) ---------------------------------------------------

export const SKILL_NAME = /^[a-z0-9-]{1,64}$/;

export interface SkillInfo {
  name: string;
  description: string;
  /** Optional hint of when to use the skill (frontmatter `when`). */
  when: string | null;
  scope: "account" | "bot";
  /** The owning bot for a bot-scope skill, else null. */
  botId: string | null;
  updatedAt: string;
}

export interface Skill extends SkillInfo {
  /** The whole SKILL.md document. */
  content: string;
  /** The Markdown body after the frontmatter. */
  body: string;
}

// --- routines (specs/routines) -----------------------------------------------

export type RoutineTrigger = { type: "cron"; cron: string; timezone: string } | { type: "webhook" };
export type RoutineApproval = "normal" | "draft_only";

export interface RoutineRun {
  id: string;
  routineId: string;
  runId: string | null;
  test: boolean;
  /** The bot that called this routine with routine.call; null for the schedule, a webhook or a test. */
  calledBy?: string | null;
  status: string;
  summary: string | null;
  startedAt: string;
}

export interface Routine {
  id: string;
  botId: string;
  name: string;
  trigger: RoutineTrigger;
  instruction: string;
  approval: RoutineApproval;
  enabled: boolean;
  /** Paused by the absence rule; enabling again clears it. */
  paused: boolean;
  /** Where a webhook routine listens (POST, signed), else null. */
  webhookPath: string | null;
  /** Next fire time of an enabled cron routine, else null. */
  nextRunAt: string | null;
  lastRun: RoutineRun | null;
  createdAt: string;
  updatedAt: string;
}

// --- usage (specs/usage) -----------------------------------------------------

export interface UsageTotals {
  runs: number;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  /** Every cost, API and subscription. */
  costUsd: number;
  /** The part of costUsd covered by a subscription (CLI brains). */
  subscriptionCostUsd: number;
}

export interface UsageReport {
  from: string;
  to: string;
  total: UsageTotals;
  bots: Array<{
    botId: string;
    usage: UsageTotals;
    spendCapUsd: number | null;
    capIncludesSubscription: boolean;
    /** What counts toward the cap in the range. */
    cappedCostUsd: number;
  }>;
}

// --- runtimes (specs/agent-runtimes) ------------------------------------------

/** A subscription CLI on the hub's machine, found on PATH or not. */
export interface RuntimeHealth {
  kind: "claude-code" | "codex" | "gemini-cli" | "cursor";
  /** The executable looked up (the first one found when there are several names). */
  executable: string;
  found: boolean;
  path: string | null;
  version: string | null;
}

/** A local model server (Ollama, LM Studio) and the models it serves. */
export interface LocalModelServer {
  kind: "ollama" | "lmstudio";
  baseUrl: string;
  reachable: boolean;
  models: string[];
  error: string | null;
}

/** The question a brain test asks: only a model answers it; an echo does not. */
export const BRAIN_TEST_QUESTION = "What is 17 × 23? Answer with the number only.";
export const BRAIN_TEST_ANSWER = "391";

export interface BrainTestResult {
  kind: BrainKind;
  /** The brain ran to the end without failing. */
  ok: boolean;
  reply: string;
  error: string | null;
  durationMs: number;
  /** The reply holds the answer to the test question: a model answered, not an echo. */
  answered: boolean;
}

/** Where recorded speech becomes text when the browser cannot do it (specs/hub-api: voice). */
export interface TranscriptionStatus {
  configured: boolean;
  /** What set it up: the settings screen, the environment, or the OpenAI key alone. */
  source: "settings" | "env" | "openai" | null;
  /** Base address of an OpenAI-compatible service (`…/audio/transcriptions` is appended). */
  url: string | null;
  model: string | null;
  /** A key is stored; its value never leaves the hub. */
  hasKey: boolean;
}

export interface TranscriptionTestResult {
  ok: boolean;
  text: string;
  durationMs: number;
  error: string | null;
}

/** What each kind of computer needs and whether this hub has it (`GET /api/v1/computers`). */
export interface ComputerProvidersInfo {
  default: ComputerProviderKind;
  local: { available: true };
  host: { available: true; home: string; platform: string; visibleBrowser: boolean };
  docker: {
    /** The docker CLI answered and its daemon is running. */
    available: boolean;
    installed: boolean;
    version: string | null;
    error: string | null;
    image: string;
    imagePresent: boolean;
    /** The Dockerfile of the desktop image ships with this install, so the hub can build it. */
    canBuild: boolean;
    build: ImageBuild;
  };
}

export interface ImageBuild {
  state: "idle" | "building" | "done" | "failed";
  startedAt: string | null;
  finishedAt: string | null;
  /** The last lines of `docker build`. */
  log: string;
  error: string | null;
}

// --- MCP servers and the marketplace (specs/tool-gateway) ---------------------

export type McpTransportKind = "stdio" | "http";
/** How a server proves who is calling: nothing, a key or token the user pastes, or signing in with their account. */
/** `device`: the program signs in by itself with a code the user types on the service's page (OneDrive). */
export type McpAuthKind = "none" | "token" | "oauth" | "device";
export type McpServerStatus = "connecting" | "connected" | "needs_auth" | "error";

export interface Localized {
  en: string;
  "pt-BR": string;
}

/** A value the user fills in to connect: an API key, a token, a folder. */
export interface McpField {
  key: string;
  label: Localized;
  secret: boolean;
  /**
   * Where it goes: an environment variable of a stdio server, an argument, the Authorization header, or a
   * query parameter of an http server's address named by `key` (kept in the vault, never in the address shown);
   * or the user's own OAuth client (`client_id`, `client_secret`) that Orbis signs in with, for a service that
   * lets no app register itself (Google).
   */
  target: "env" | "arg" | "bearer" | "query" | "client_id" | "client_secret";
  placeholder?: string;
  help?: Localized;
  /** Where to get it. */
  link?: string;
  optional?: boolean;
}

/** One entry of the marketplace: a server Orbis knows how to connect. */
export interface McpCatalogEntry {
  id: string;
  name: string;
  icon: string;
  /** The service's own logo, a path under the web app (`/logos/mcp/<id>.svg`); `icon` is the fallback. */
  logo?: string;
  category: "research" | "dev" | "work" | "finance" | "marketing" | "browser" | "files" | "reasoning";
  description: Localized;
  transport: McpTransportKind;
  /** stdio: the command and arguments (e.g. npx -y <package>). */
  command?: string;
  args?: string[];
  /** http: the streamable HTTP endpoint. */
  url?: string;
  auth: McpAuthKind;
  fields: McpField[];
  homepage: string;
  /** What the machine needs, e.g. Node.js for npx servers. */
  needs?: string;
  /** Every tool of this server only reads: they run without asking, unless a rule says otherwise. */
  readOnly?: boolean;
  /** The tools that only read, for a server that does not mark them itself (they run without asking). */
  readOnlyTools?: string[];
  /** A program that cannot sign in by itself: Orbis signs in for it and hands it the sign-in. */
  oauth?: McpCatalogOAuth;
}

/**
 * Orbis's sign-in for a stdio server (auth `oauth`): the user signs in through Orbis with their own OAuth client
 * (the entry's `client_id` and `client_secret` fields), Orbis keeps the tokens encrypted and starts the program
 * with them in its environment.
 */
export interface McpCatalogOAuth {
  authorizationEndpoint: string;
  tokenEndpoint: string;
  /** The scopes asked for, space-separated. */
  scope: string;
  /** More sign-in parameters, e.g. Google's `access_type=offline` that brings a refresh token. */
  params?: Record<string, string>;
  /** The program's environment variables that receive the sign-in. */
  env: { accessToken: string; refreshToken?: string; clientId?: string; clientSecret?: string };
}

export interface McpServerTool {
  /** The Orbis name: `mcp.<server>.<tool>`. */
  name: string;
  /** The server's own name for the tool. */
  remoteName: string;
  description: string;
  readOnly: boolean;
}

/** A server connected to this hub. */
export interface McpServer {
  id: string;
  name: string;
  icon: string;
  /** The logo of its marketplace entry, when it has one. */
  logo: string | null;
  catalogId: string | null;
  transport: McpTransportKind;
  url: string | null;
  command: string | null;
  args: string[];
  auth: McpAuthKind;
  status: McpServerStatus;
  error: string | null;
  /** Where the user signs in, while status is `needs_auth` for an OAuth server. */
  authUrl: string | null;
  tools: McpServerTool[];
  /** The bots whose allowlist gives them this server's tools. */
  bots: string[];
  /** The bots that answer its updates (change 0061): while there are any, it stays connected. */
  watchers?: string[];
  createdAt: string;
  updatedAt: string;
}

/** A registered tool, for choosing a bot's tools (`GET /api/v1/tools`). */
export interface ToolInfo {
  name: string;
  description: string;
  risk: "read" | "write" | "external";
  /** The MCP server it comes from, or null for Orbis's own tools. */
  server: string | null;
}

// --- ChatGPT through the Codex CLI (specs/agent-runtimes) ----------------------

/** An install or sign-in the hub runs for a CLI brain. */
export interface CliJob {
  kind: "install" | "login";
  state: "running" | "done" | "failed";
  startedAt: string;
  finishedAt: string | null;
  /** Sign-in: the page to open. */
  url: string | null;
  /** Device sign-in: the one-time code to type on that page. */
  code: string | null;
  log: string;
  error: string | null;
}

/** What Claude Code reports when its login is gone or expired, so a failed run or test can offer signing in again. */
export const CLAUDE_AUTH_FAILURE = /oauth|failed to authenticate|authentication|not logged in|please run \/login|invalid api key|session expired|\b401\b/i;

/** The Claude Code CLI on the hub's machine and whose account it uses (`GET /api/v1/runtimes/claude/account`). */
export interface ClaudeAccount {
  installed: boolean;
  version: string | null;
  path: string | null;
  loggedIn: boolean;
  /** How it is signed in (`claude auth status`: `oauth_token`, `api_key`, …). */
  method: string | null;
  /** What `claude auth status` said, for a person to read. */
  detail: string | null;
  job: CliJob | null;
  /** The subscription token Claude Code runs with, when there is one (never its value). */
  token: ClaudeTokenStatus;
}

/**
 * The variable Claude Code reads its subscription's long-lived token from: the
 * token `claude setup-token` prints, which bills the Claude plan and not the API.
 * A bot secret of this name gives that bot another account.
 */
export const CLAUDE_OAUTH_TOKEN = "CLAUDE_CODE_OAUTH_TOKEN";

/** Whether Claude Code has a subscription token from Orbis (`PUT /api/v1/runtimes/claude/token`), never the token. */
export interface ClaudeTokenStatus {
  saved: boolean;
  /** Saved in Orbis, or set as CLAUDE_CODE_OAUTH_TOKEN in the hub's environment. */
  source: "saved" | "server" | null;
  savedAt: string | null;
  /** `claude setup-token` makes a token for one year: about when this one ends. */
  expiresAround: string | null;
}

/** The Codex CLI on the hub's machine and whose account it uses (`GET /api/v1/runtimes/codex/account`). */
export interface CodexAccount {
  installed: boolean;
  version: string | null;
  path: string | null;
  loggedIn: boolean;
  /** `chatgpt`: the user's ChatGPT plan, no API key. */
  method: "chatgpt" | "api-key" | null;
  /** The last line of `codex login status`. */
  detail: string | null;
  job: CliJob | null;
}

// --- hiring (specs/hiring) -----------------------------------------------------

/** What a round of candidates is based on: a project's scope typed by the user, or one of the user's groups. */
export type HiringBasis = "project" | "team";

export type CandidateStatus = "open" | "hiring" | "hired" | "dismissed";

/**
 * A short résumé: what the recruiter's brain writes for each candidate, kept small so that many fit in
 * one answer. The full profile is written only when the user hires the candidate.
 */
export interface Candidate {
  id: string;
  roundId: string;
  name: string;
  role: string;
  /** One sentence: who this is and what they bring. */
  headline: string;
  /** Three to five short strengths. */
  strengths: string[];
  /** The tools they would use, among the ones available: `computer`, `browser`, `web` or `mcp.<server>`. */
  tools: string[];
  status: CandidateStatus;
  /** Why the last hire failed, until the next try. */
  error: string | null;
  /** The bot hired from this candidate. */
  botId: string | null;
  createdAt: string;
}

export type HiringRoundStatus = "generating" | "ready" | "failed";

export interface HiringRound {
  id: string;
  basis: HiringBasis;
  /** The project's scope, or the focus the user gave for a team round. */
  brief: string;
  /** The group of a team round; null when the group was deleted. */
  groupId: string | null;
  /** The bot whose brain writes the résumés and the profiles; null when it was deleted. */
  recruiterId: string | null;
  /** How many candidates the last generation asked for. */
  requested: number;
  status: HiringRoundStatus;
  error: string | null;
  /** Every generation and profile of this round together. */
  usage: { inputTokens: number; outputTokens: number; costUsd: number };
  candidates: Candidate[];
  createdAt: string;
  updatedAt: string;
}

/** The tools a candidate may use, as the recruiter is told them. */
export interface HiringTool {
  id: string;
  name: string;
  description: string;
  /** An MCP server's logo (`/logos/mcp/<id>.svg`), or null. */
  logo: string | null;
}

// --- squads (specs/squads) -------------------------------------------------------

/**
 * A squad: bots organized under a name. Its members report to its representative, who reports to the
 * squad's manager; one manager may take every squad. `@handle` reaches the representative.
 */
export interface Squad {
  id: string;
  name: string;
  /** How bots and the user call the squad: `@handle` reaches its representative. */
  handle: string;
  description: string;
  color: string;
  /** The member who speaks for the squad; the other members report to it. */
  representativeId: string | null;
  /** The bot the representative reports to; any bot outside this squad, or null. */
  managerId: string | null;
  /** The squad's own group conversation, kept to its members (from two of them). */
  conversationId: string | null;
  /** Member bot ids, by name. */
  members: string[];
  createdAt: string;
  updatedAt: string;
}

/** Every squad, and the room where the representatives and the managers talk. */
export interface SquadsView {
  squads: Squad[];
  /** The group of every representative and manager, from two of them; null before. */
  roomId: string | null;
}
