// Client state, fed by REST loads and the event stream.
import { create } from "zustand";
import type { Approval, ApprovalDecision, Bot, Conversation, DraftFields, Run, Step, StreamEvent, TimelineItem } from "@orbis/shared";
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
  error: string | null;

  setApi(api: Api | null): void;
  setConnected(connected: boolean): void;
  setError(error: string | null): void;
  loadBots(): Promise<void>;
  selectBot(botId: string | null): Promise<void>;
  loadConversations(): Promise<void>;
  selectGroup(conversationId: string | null): Promise<void>;
  createGroup(input: { title: string; members: string[]; leadBotId?: string }): Promise<Conversation>;
  loadTimeline(conversationId: string): Promise<void>;
  send(conversationId: string, text: string): Promise<void>;
  createBot(input: object): Promise<Bot>;
  loadApprovals(): Promise<void>;
  answerApproval(id: string, decision: ApprovalDecision, note?: string): Promise<void>;
  sendDraft(itemId: string, fields: Partial<DraftFields>): Promise<void>;
  discardDraft(itemId: string): Promise<void>;
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
  error: null,

  setApi: (api) => set({ api }),
  setConnected: (connected) => set({ connected }),
  setError: (error) => set({ error }),

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
    void api.post(`/api/v1/conversations/${conv.id}/read`).catch(() => undefined);
  },

  async loadConversations() {
    const api = get().api;
    if (!api) return;
    const list = await api.get<Conversation[]>("/api/v1/conversations");
    set((s) => ({ conversations: { ...s.conversations, ...Object.fromEntries(list.map((c) => [c.id, c])) } }));
  },

  async selectGroup(conversationId) {
    set({ selectedGroupId: conversationId, selectedBotId: null });
    const api = get().api;
    if (!api || !conversationId) return;
    await get().loadTimeline(conversationId);
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

  async discardDraft(itemId) {
    const api = get().api;
    if (!api) return;
    const item = await api.post<TimelineItem>(`/api/v1/cards/${itemId}/discard`);
    set((s) => ({ items: { ...s.items, [item.conversationId]: upsertItem(s.items[item.conversationId], item) } }));
  },

  apply(event) {
    switch (event.type) {
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
