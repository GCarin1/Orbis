// Client state, fed by REST loads and the event stream.
import { create } from "zustand";
import type {
  Approval,
  ApprovalDecision,
  Bot,
  ComputerStatus,
  Conversation,
  DraftFields,
  Routine,
  RoutineApproval,
  RoutineTrigger,
  Run,
  SkillInfo,
  Step,
  StreamEvent,
  TimelineItem,
} from "@orbis/shared";
import { Api } from "./api.js";

export type RunView = Omit<Run, "steps"> & { steps: Step[] };

interface State {
  api: Api | null;
  connected: boolean;
  bots: Record<string, Bot>;
  selectedBotId: string | null;
  selectedGroupId: string | null;
  conversations: Record<string, Conversation>;
  directByBot: Record<string, string>;
  items: Record<string, TimelineItem[]>;
  runs: Record<string, RunView>;
  approvals: Record<string, Approval>;
  computers: Record<string, ComputerStatus>;
  /** Skills offered to each bot, for the `/` autocomplete. */
  offeredSkills: Record<string, SkillInfo[]>;
  routines: Record<string, Routine[]>;
  /** When the user last looked at each conversation (ISO time), kept in this browser. */
  readAt: Record<string, string>;
  error: string | null;

  setApi(api: Api | null): void;
  setConnected(connected: boolean): void;
  setError(error: string | null): void;
  /** Mark a conversation as read up to now. */
  markSeen(conversationId: string): void;
  /** True when a conversation has items newer than the last time the user looked at it. */
  isUnread(conversationId: string | undefined): boolean;
  loadBots(): Promise<void>;
  selectBot(botId: string | null): Promise<void>;
  loadConversations(): Promise<void>;
  /** Open a conversation by id (a desktop notification click). */
  openConversation(conversationId: string): Promise<void>;
  selectGroup(conversationId: string | null): Promise<void>;
  createGroup(input: { title: string; members: string[]; leadBotId?: string }): Promise<Conversation>;
  loadTimeline(conversationId: string): Promise<void>;
  send(conversationId: string, text: string): Promise<void>;
  createBot(input: object): Promise<Bot>;
  loadApprovals(): Promise<void>;
  answerApproval(id: string, decision: ApprovalDecision, note?: string): Promise<void>;
  sendDraft(itemId: string, fields: Partial<DraftFields>): Promise<void>;
  discardDraft(itemId: string): Promise<void>;
  answerSecret(itemId: string, answer: { value: string } | { decline: true }): Promise<void>;
  loadComputer(botId: string): Promise<void>;
  updateBot(botId: string, patch: object): Promise<Bot>;
  duplicateBot(botId: string): Promise<Bot>;
  deleteBot(botId: string): Promise<void>;
  importBot(yaml: string): Promise<Bot>;
  loadOfferedSkills(botId: string): Promise<void>;
  loadRoutines(botId: string): Promise<void>;
  createRoutine(botId: string, input: { name: string; trigger: RoutineTrigger; instruction: string; approval: RoutineApproval }): Promise<Routine & { secret: string }>;
  routineAction(routine: Routine, action: "test" | "enable" | "disable" | "delete", force?: boolean): Promise<void>;
  computerAction(botId: string, action: "start" | "stop" | "takeover" | "release"): Promise<void>;
  apply(event: StreamEvent): void;
}

function upsertItem(list: TimelineItem[] | undefined, item: TimelineItem): TimelineItem[] {
  const current = list ?? [];
  const index = current.findIndex((i) => i.id === item.id);
  if (index === -1) return [...current, item];
  const next = current.slice();
  next[index] = item;
  return next;
}

const READ_KEY = "orbis.readAt";

function loadReadAt(): Record<string, string> {
  try {
    const raw = globalThis.localStorage?.getItem(READ_KEY);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function saveReadAt(readAt: Record<string, string>): void {
  try {
    globalThis.localStorage?.setItem(READ_KEY, JSON.stringify(readAt));
  } catch {
    /* private mode: unread dots last for this tab only */
  }
}

export const useStore = create<State>((set, get) => ({
  api: null,
  connected: false,
  bots: {},
  selectedBotId: null,
  selectedGroupId: null,
  conversations: {},
  directByBot: {},
  items: {},
  runs: {},
  approvals: {},
  computers: {},
  offeredSkills: {},
  routines: {},
  readAt: loadReadAt(),
  error: null,

  setApi: (api) => set({ api }),
  setConnected: (connected) => set({ connected }),
  setError: (error) => set({ error }),

  markSeen(conversationId) {
    const readAt = { ...get().readAt, [conversationId]: new Date().toISOString() };
    set({ readAt });
    saveReadAt(readAt);
  },

  isUnread(conversationId) {
    if (!conversationId) return false;
    const conv = get().conversations[conversationId];
    const last = conv?.lastItemAt;
    if (!last) return false;
    const seen = get().readAt[conversationId];
    return !seen || last > seen;
  },

  async loadBots() {
    const api = get().api;
    if (!api) return;
    const bots = await api.get<Bot[]>("/api/v1/bots?includeHidden=true");
    set({ bots: Object.fromEntries(bots.map((b) => [b.id, b])) });
  },

  async selectBot(botId) {
    set({ selectedBotId: botId, selectedGroupId: null });
    const api = get().api;
    if (!api || !botId) return;
    const conv = await api.get<Conversation>(`/api/v1/bots/${botId}/conversation`);
    set((s) => ({
      conversations: { ...s.conversations, [conv.id]: conv },
      directByBot: { ...s.directByBot, [botId]: conv.id },
    }));
    await get().loadTimeline(conv.id);
    get().markSeen(conv.id);
    void api.post(`/api/v1/conversations/${conv.id}/read`).catch(() => undefined);
  },

  async loadConversations() {
    const api = get().api;
    if (!api) return;
    const list = await api.get<Conversation[]>("/api/v1/conversations");
    set((s) => ({ conversations: { ...s.conversations, ...Object.fromEntries(list.map((c) => [c.id, c])) } }));
  },

  async openConversation(conversationId) {
    const api = get().api;
    if (!api) return;
    const conv = get().conversations[conversationId] ?? (await api.get<Conversation>(`/api/v1/conversations/${conversationId}`));
    if (conv.kind === "group") await get().selectGroup(conv.id);
    else if (conv.members[0]) await get().selectBot(conv.members[0]);
  },

  async selectGroup(conversationId) {
    set({ selectedGroupId: conversationId, selectedBotId: null });
    const api = get().api;
    if (!api || !conversationId) return;
    await get().loadTimeline(conversationId);
    get().markSeen(conversationId);
    void api.post(`/api/v1/conversations/${conversationId}/read`).catch(() => undefined);
  },

  async createGroup(input) {
    const api = get().api!;
    const group = await api.post<Conversation>("/api/v1/conversations", input);
    set((s) => ({ conversations: { ...s.conversations, [group.id]: group } }));
    return group;
  },

  async loadTimeline(conversationId) {
    const api = get().api;
    if (!api) return;
    const [items, runs] = await Promise.all([
      api.get<TimelineItem[]>(`/api/v1/conversations/${conversationId}/items?limit=200`),
      api.get<Run[]>(`/api/v1/runs?conversationId=${conversationId}&limit=100`),
    ]);
    set((s) => ({
      items: { ...s.items, [conversationId]: items },
      runs: { ...s.runs, ...Object.fromEntries(runs.map((r) => [r.id, r])) },
    }));
  },

  async send(conversationId, text) {
    const api = get().api;
    if (!api) return;
    const res = await api.post<{ item: TimelineItem; runs: Run[] }>(`/api/v1/conversations/${conversationId}/messages`, { text });
    set((s) => ({
      items: { ...s.items, [conversationId]: upsertItem(s.items[conversationId], res.item) },
      runs: { ...s.runs, ...Object.fromEntries(res.runs.map((r) => [r.id, { ...r, ...(s.runs[r.id] ?? {}) }])) },
    }));
  },

  async createBot(input) {
    const api = get().api!;
    const bot = await api.post<Bot>("/api/v1/bots", input);
    set((s) => ({ bots: { ...s.bots, [bot.id]: bot } }));
    return bot;
  },

  async loadApprovals() {
    const api = get().api;
    if (!api) return;
    const pending = await api.get<Approval[]>("/api/v1/approvals?status=pending");
    set({ approvals: Object.fromEntries(pending.map((a) => [a.id, a])) });
  },

  async answerApproval(id, decision, note) {
    const api = get().api;
    if (!api) return;
    const approval = await api.post<Approval>(`/api/v1/approvals/${id}`, { decision, ...(note ? { note } : {}) });
    set((s) => ({ approvals: { ...s.approvals, [id]: approval } }));
  },

  async sendDraft(itemId, fields) {
    const api = get().api;
    if (!api) return;
    const item = await api.post<TimelineItem>(`/api/v1/cards/${itemId}/send`, { fields });
    set((s) => ({ items: { ...s.items, [item.conversationId]: upsertItem(s.items[item.conversationId], item) } }));
  },

  async answerSecret(itemId, answer) {
    const api = get().api;
    if (!api) return;
    const item = await api.post<TimelineItem>(`/api/v1/cards/${itemId}/secret`, answer);
    set((s) => ({ items: { ...s.items, [item.conversationId]: upsertItem(s.items[item.conversationId], item) } }));
  },

  async discardDraft(itemId) {
    const api = get().api;
    if (!api) return;
    const item = await api.post<TimelineItem>(`/api/v1/cards/${itemId}/discard`);
    set((s) => ({ items: { ...s.items, [item.conversationId]: upsertItem(s.items[item.conversationId], item) } }));
  },

  async updateBot(botId, patch) {
    const bot = await get().api!.patch<Bot>(`/api/v1/bots/${botId}`, patch);
    set((s) => ({ bots: { ...s.bots, [bot.id]: bot } }));
    return bot;
  },

  async duplicateBot(botId) {
    const bot = await get().api!.post<Bot>(`/api/v1/bots/${botId}/duplicate`);
    set((s) => ({ bots: { ...s.bots, [bot.id]: bot } }));
    return bot;
  },

  async deleteBot(botId) {
    await get().api!.delete(`/api/v1/bots/${botId}`);
    set((s) => {
      const bots = { ...s.bots };
      delete bots[botId];
      return { bots, selectedBotId: s.selectedBotId === botId ? null : s.selectedBotId };
    });
  },

  async importBot(yaml) {
    const bot = await get().api!.post<Bot>("/api/v1/bots/import", { yaml });
    set((s) => ({ bots: { ...s.bots, [bot.id]: bot } }));
    return bot;
  },

  async loadComputer(botId) {
    const api = get().api;
    if (!api) return;
    const status = await api.get<ComputerStatus>(`/api/v1/bots/${botId}/computer`);
    set((s) => ({ computers: { ...s.computers, [botId]: status } }));
  },

  async computerAction(botId, action) {
    const api = get().api;
    if (!api) return;
    const status = await api.post<ComputerStatus>(`/api/v1/bots/${botId}/computer/${action}`);
    set((s) => ({ computers: { ...s.computers, [botId]: status } }));
  },

  async loadOfferedSkills(botId) {
    const api = get().api;
    if (!api) return;
    const skills = await api.get<SkillInfo[]>(`/api/v1/skills?botId=${encodeURIComponent(botId)}&offered=true`);
    set((s) => ({ offeredSkills: { ...s.offeredSkills, [botId]: skills } }));
  },

  async loadRoutines(botId) {
    const api = get().api;
    if (!api) return;
    const routines = await api.get<Routine[]>(`/api/v1/bots/${encodeURIComponent(botId)}/routines`);
    set((s) => ({ routines: { ...s.routines, [botId]: routines } }));
  },

  async createRoutine(botId, input) {
    const api = get().api!;
    const routine = await api.post<Routine & { secret: string }>(`/api/v1/bots/${encodeURIComponent(botId)}/routines`, input);
    await get().loadRoutines(botId);
    return routine;
  },

  async routineAction(routine, action, force = false) {
    const api = get().api!;
    if (action === "delete") await api.delete(`/api/v1/routines/${routine.id}`);
    else await api.post(`/api/v1/routines/${routine.id}/${action}`, action === "enable" && force ? { force: true } : {});
    await get().loadRoutines(routine.botId);
  },

  apply(event) {
    switch (event.type) {
      case "computer.updated": {
        const { botId, computer } = event.data as { botId: string; computer: ComputerStatus };
        set((s) => ({ computers: { ...s.computers, [botId]: computer } }));
        break;
      }
      case "approval.requested":
      case "approval.resolved": {
        const { approval } = event.data as { approval: Approval };
        set((s) => ({ approvals: { ...s.approvals, [approval.id]: approval } }));
        break;
      }
      case "bot.state": {
        const { botId, state } = event.data as { botId: string; state: Bot["state"] };
        set((s) => (s.bots[botId] ? { bots: { ...s.bots, [botId]: { ...s.bots[botId]!, state } } } : {}));
        break;
      }
      case "bot.updated": {
        const { bot } = event.data as { bot: Bot };
        set((s) => ({ bots: { ...s.bots, [bot.id]: bot } }));
        break;
      }
      case "bot.deleted": {
        const { botId } = event.data as { botId: string };
        set((s) => {
          const bots = { ...s.bots };
          delete bots[botId];
          return { bots, selectedBotId: s.selectedBotId === botId ? null : s.selectedBotId };
        });
        break;
      }
      case "conversation.updated": {
        const { conversation } = event.data as { conversation: Conversation };
        set((s) => ({ conversations: { ...s.conversations, [conversation.id]: conversation } }));
        break;
      }
      case "conversation.deleted": {
        const { conversationId } = event.data as { conversationId: string };
        set((s) => {
          const conversations = { ...s.conversations };
          delete conversations[conversationId];
          return { conversations, selectedGroupId: s.selectedGroupId === conversationId ? null : s.selectedGroupId };
        });
        break;
      }
      case "timeline.item": {
        const { conversationId, item } = event.data as { conversationId: string; item: TimelineItem };
        set((s) => {
          const next: Partial<State> = {};
          if (s.items[conversationId]) next.items = { ...s.items, [conversationId]: upsertItem(s.items[conversationId], item) };
          // The conversation's latest activity drives the list order and the unread dot.
          const known = s.conversations[conversationId];
          if (known && (!known.lastItemAt || item.createdAt > known.lastItemAt)) {
            next.conversations = { ...s.conversations, [conversationId]: { ...known, lastItemAt: item.createdAt } };
          }
          // Keep the roster's last message current.
          if (item.kind === "message") {
            const conv = s.conversations[conversationId];
            const botId = item.author.type === "bot" ? item.author.id : conv?.kind === "direct" ? conv.members[0] : null;
            if (botId && s.bots[botId]) {
              next.bots = { ...s.bots, [botId]: { ...s.bots[botId]!, lastMessage: { text: item.text, at: item.createdAt } } };
            }
          }
          return next;
        });
        break;
      }
      case "run.updated": {
        const { run } = event.data as { run: Omit<Run, "steps"> };
        set((s) => ({ runs: { ...s.runs, [run.id]: { ...run, steps: s.runs[run.id]?.steps ?? [] } } }));
        break;
      }
      case "run.step": {
        const { runId, step } = event.data as { runId: string; step: Step };
        set((s) => {
          const run = s.runs[runId];
          if (!run) return {};
          return { runs: { ...s.runs, [runId]: { ...run, steps: [...run.steps, step] } } };
        });
        break;
      }
      default:
        break;
    }
  },
}));
