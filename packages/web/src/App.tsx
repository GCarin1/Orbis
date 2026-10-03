import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { roleSlug, type Bot, type TranscriptionStatus } from "@orbis/shared";
import { Api, capturePairingFromUrl, captureTokenFromUrl, loadToken, openStream, saveToken } from "./api.js";
import { useLang, useT } from "./i18n.js";
import { useStore } from "./store.js";
import { useReadAloud, useVoice } from "./voice.js";
import { closeBackLayer, saveTextFile, setBackHandler, setOpenConversationHandler, setShareHandler } from "./native.js";
import { notifyPhone } from "./phone.js";
import { Avatar, Mascot, StateLabel } from "./components/Avatar.js";
import { Composer, type MentionOption, type SkillOption } from "./components/Composer.js";
import { NewBotScreen } from "./components/NewBotScreen.js";
import { Timeline } from "./components/Timeline.js";
import { TokenGate } from "./components/TokenGate.js";
import { MAX_GROUP_SIZE, NewGroupDialog } from "./components/Groups.js";
import { AddMembersDialog, conversationText, GroupHeader, GroupInfoPanel, type GroupActions, type GroupView } from "./components/GroupInfo.js";
import { ComputerPanel } from "./components/ComputerPanel.js";
import { RoutinesPanel } from "./components/RoutinesPanel.js";
import { BotSettings } from "./components/BotSettings.js";
import { BotPanel } from "./components/BotPanel.js";
import { SkillsScreen } from "./components/SkillsScreen.js";
import { UsageScreen } from "./components/UsageScreen.js";
import { SettingsScreen } from "./components/SettingsScreen.js";
import { SquadsScreen } from "./components/SquadsScreen.js";
import { HiringScreen } from "./components/HiringScreen.js";
import { Marketplace } from "./components/Marketplace.js";
import { PanelResizer, usePanelWidth } from "./components/PanelResizer.js";
import { GroupFace, Sidebar, type View } from "./components/Sidebar.js";
import { brainLabel, brainShort } from "./components/brains.js";
import { BackIcon, ClockIcon, EraseIcon, GearIcon, MonitorIcon, PanelIcon } from "./components/Icons.js";

type Panel = "details" | "computer" | "routines" | "settings" | null;

const PANEL_KEY = "orbis.detailsPanel";
const wide = () => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(min-width: 1180px)").matches;

function initialPanel(): Panel {
  try {
    const saved = globalThis.localStorage?.getItem(PANEL_KEY);
    if (saved === "closed") return null;
  } catch {
    /* no storage */
  }
  return wide() ? "details" : null;
}

export function App() {
  const t = useT();
  const [token, setToken] = useState<string | null>(() => {
    captureTokenFromUrl();
    return loadToken();
  });
  /** A pairing code from a QR code's link (#pair=…), for the sign-in screen to trade for the token. */
  const [pairCode] = useState(capturePairingFromUrl);
  const lang = useLang((s) => s.lang);
  const [creatingGroup, setCreatingGroup] = useState(false);
  /** A group's info beside its conversation (a flyout; full screen on a phone), and which part of it. */
  const [groupView, setGroupView] = useState<GroupView | null>(null);
  const [addingMembers, setAddingMembers] = useState(false);
  /** A message to show in the timeline (a search result or a link's message). */
  const [focus, setFocus] = useState<{ itemId: string; at: number } | null>(null);
  /** How many bots a group holds (the hub's ORBIS_MAX_GROUP_SIZE). */
  const [maxGroupSize, setMaxGroupSize] = useState(MAX_GROUP_SIZE);
  /** Text shared into the Android app, until a conversation's message box takes it. */
  const [shared, setShared] = useState<string | null>(null);
  // One side panel at a time beside a direct conversation.
  const [panel, setPanelState] = useState<Panel>(initialPanel);
  const setPanel = (next: Panel) => {
    setPanelState(next);
    try {
      if (next === "details") globalThis.localStorage?.setItem(PANEL_KEY, "open");
      else if (next === null) globalThis.localStorage?.setItem(PANEL_KEY, "closed");
    } catch {
      /* no storage */
    }
  };
  const computerOpen = panel === "computer";
  const [view, setView] = useState<View>("chat");
  const [computerFull, setComputerFull] = useState(false);
  const [panelWidth, setPanelWidth] = usePanelWidth();
  /** What a header action (clear, remove, delete) answered when it failed. */
  const [actionError, setActionError] = useState<string | null>(null);
  const act = async (fn: () => Promise<void>) => {
    setActionError(null);
    try {
      await fn();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    }
  };
  const store = useStore();

  useEffect(() => {
    if (!token) return;
    const api = new Api(token);
    store.setApi(api);
    void api
      .get<{ maxGroupSize: number }>("/api/v1/conversations/limits")
      .then((limits) => setMaxGroupSize(limits.maxGroupSize))
      .catch(() => undefined);
    void api
      .get<{ transcription: TranscriptionStatus }>("/api/v1/voice")
      .then((voice) => useVoice.getState().setTranscription(voice.transcription))
      .catch(() => undefined);
    void useStore.getState().loadApprovals().catch(() => undefined);
    void useStore.getState().loadConversations().catch(() => undefined);
    void useStore.getState().loadMcpServers().catch(() => undefined);
    void useStore.getState().loadSquads().catch(() => undefined);
    void useStore.getState().loadBots().catch((err: unknown) => {
      if ((err as { status?: number }).status === 401) {
        saveToken(null);
        setToken(null);
      }
    });
    const stop = openStream(token, {
      onEvent: (e) => {
        const s = useStore.getState();
        s.apply(e);
        // The Android app off screen: a bot's reply or request becomes a notification.
        notifyPhone(e, { bots: s.bots, conversations: s.conversations });
      },
      onStatus: (c) => useStore.getState().setConnected(c),
      onReconnect: () => {
        const s = useStore.getState();
        void s.loadBots();
        void s.loadApprovals();
        void s.loadConversations();
        void s.loadMcpServers().catch(() => undefined);
        void s.loadSquads().catch(() => undefined);
        const conv = s.selectedGroupId ?? (s.selectedBotId ? s.directByBot[s.selectedBotId] : undefined);
        if (conv) void s.loadTimeline(conv);
      },
    });
    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // In the desktop app and the Android app, a notification click opens its conversation.
  useEffect(() => {
    const open = (conversationId: string) => {
      setView("chat");
      void useStore.getState().openConversation(conversationId);
    };
    const desktop = (window as unknown as { orbisDesktop?: { onOpenConversation?(cb: (id: string) => void): void } }).orbisDesktop;
    desktop?.onOpenConversation?.(open);
    setOpenConversationHandler(open);
    // Text shared into the Android app from another app waits for a message box.
    setShareHandler((text) => setShared(text));
    return () => {
      setOpenConversationHandler(null);
      setShareHandler(null);
    };
  }, []);

  const bots = useMemo(() => Object.values(store.bots), [store.bots]);
  const selected = store.selectedBotId ? store.bots[store.selectedBotId] : undefined;
  useEffect(() => {
    if ((computerOpen || panel === "details") && selected) void useStore.getState().loadComputer(selected.id).catch(() => undefined);
  }, [computerOpen, panel, selected?.id]);
  const group = store.selectedGroupId ? store.conversations[store.selectedGroupId] : undefined;
  // Another conversation starts with its info closed.
  useEffect(() => {
    setGroupView(null);
    setAddingMembers(false);
    setFocus(null);
  }, [store.selectedGroupId]);
  const conversationId = group ? group.id : selected ? store.directByBot[selected.id] : undefined;
  // `/` autocomplete: the skills offered to the bot, or to any member of the group.
  const skillBots = group ? group.members : selected ? [selected.id] : [];
  useEffect(() => {
    for (const id of skillBots) void useStore.getState().loadOfferedSkills(id).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skillBots.join(",")]);
  const skillOptions: SkillOption[] = [
    ...new Map(skillBots.flatMap((id) => store.offeredSkills[id] ?? []).map((s) => [s.name, { name: s.name, description: s.description }])).values(),
  ];
  // `@` autocomplete: every visible bot of the team, then the roles (`@qa`), and @everyone in a group.
  const visibleBots = bots.filter((b) => !b.hidden);
  const mentionPool = group ? [...group.members.map((id) => store.bots[id]).filter((b): b is Bot => b !== undefined), ...visibleBots.filter((b) => !group.members.includes(b.id))] : visibleBots;
  const mentions: MentionOption[] = mentionPool.map((b) => ({ handle: b.handle, label: b.role ? `${b.name} — ${b.role}` : b.name, bot: b }));
  const roles = new Map<string, string>();
  for (const b of visibleBots) {
    const slug = roleSlug(b.role);
    if (slug && !mentionPool.some((m) => m.handle === slug) && !roles.has(slug)) roles.set(slug, b.role);
  }
  for (const [slug, role] of roles) mentions.push({ handle: slug, label: t("mention.role", { role }) });
  if (group) mentions.push({ handle: "everyone", label: t("mention.everyone") });
  const items = conversationId ? (store.items[conversationId] ?? []) : [];
  const activeRuns = useMemo(
    () =>
      Object.values(store.runs).filter(
        (r) => r.conversationId === conversationId && (r.status === "running" || r.status === "queued" || r.status === "waiting"),
      ),
    [store.runs, conversationId],
  );
  // What arrives in the open conversation is read.
  const lastItem = items.at(-1)?.id;
  useEffect(() => {
    if (conversationId && view === "chat") useStore.getState().markSeen(conversationId);
  }, [conversationId, lastItem, view]);

  // Voice: new replies of the open conversation are read aloud when the user asked for it.
  useReadAloud(conversationId, items, conversationId !== undefined && store.items[conversationId] !== undefined);
  const transcription = useVoice((s) => s.transcription);
  const transcribe = store.api && transcription?.configured ? (audio: Blob, spokenLang: string) => store.api!.transcribe(audio, spokenLang) : null;

  // The phone's Back button in the Android app: close what is open, most recent first; false lets it leave.
  useEffect(() => {
    setBackHandler(() => {
      if (closeBackLayer()) return true;
      if (addingMembers) setAddingMembers(false);
      else if (creatingGroup) setCreatingGroup(false);
      else if (computerFull) setComputerFull(false);
      else if (groupView) setGroupView(groupView === "info" ? null : "info");
      else if (selected && panel) setPanel(null);
      else if (view !== "chat") setView("chat");
      else if (group) void useStore.getState().selectGroup(null);
      else if (selected) void useStore.getState().selectBot(null);
      else return false;
      return true;
    });
    return () => setBackHandler(null);
  });

  if (!token) {
    return (
      <TokenGate
        pairCode={pairCode}
        onToken={(value) => {
          saveToken(value);
          setToken(value);
        }}
      />
    );
  }

  const openBot = (id: string) => {
    setView("chat");
    void store.selectBot(id);
  };
  const exportBot = async (bot: Bot) => {
    const yaml = await store.api!.text(`/api/v1/bots/${bot.id}/export`);
    saveTextFile(`${bot.handle}.orbis.yaml`, yaml, "text/yaml");
  };
  const chatOpen = view !== "chat" || Boolean(selected || group);
  const sidePanel = view === "chat" && ((selected && panel && !group) || (group && groupView));
  // Everything the group's header, menu and info do.
  const groupActions: GroupActions | null = group
    ? {
        info: (next = "info") => setGroupView(next),
        add: () => setAddingMembers(true),
        mute: (muted) => act(() => store.updateGroup(group.id, { muted })),
        exportChat: () =>
          act(async () => {
            const all = await store.allItems(group.id);
            const name = group.title.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "") || "group";
            saveTextFile(`${name}.txt`, conversationText(group, all, store.bots, lang, t("group.you")));
          }),
        clear: async () => {
          if (window.confirm(t("conv.confirmClear", { name: group.title }))) await act(() => store.clearConversation(group.id));
        },
        remove: async () => {
          if (window.confirm(t("group.confirmDelete", { title: group.title }))) await act(() => store.deleteGroup(group.id));
        },
      }
    : null;

  const iconButton = (target: Exclude<Panel, null>, label: string, icon: React.ReactNode, extra?: React.ReactNode) => (
    <button className="icon-btn" aria-label={label} title={label} aria-pressed={panel === target} onClick={() => setPanel(panel === target ? null : target)}>
      {icon}
      {extra}
    </button>
  );

  return (
    <div className={`app${sidePanel ? " with-panel" : ""}${chatOpen ? " chat-open" : ""}`} style={{ "--panel-width": `${panelWidth}px` } as CSSProperties}>
      {sidePanel && !(computerOpen && computerFull) && <PanelResizer width={panelWidth} onWidth={setPanelWidth} />}
      <Sidebar
        bots={store.bots}
        conversations={Object.values(store.conversations)}
        approvals={Object.values(store.approvals)}
        selectedBotId={store.selectedBotId}
        selectedGroupId={store.selectedGroupId}
        view={view}
        isUnread={(id) => store.isUnread(id)}
        onOpenBot={openBot}
        onOpenGroup={(id) => {
          setView("chat");
          void store.selectGroup(id);
        }}
        onNewBot={() => setView("new-bot")}
        onNewGroup={() => setCreatingGroup(true)}
        onView={setView}
        squads={store.squads?.squads}
      />
      <main className="main">
        {!store.connected && <div className="banner">{t("stream.offline")}</div>}
        {view === "skills" && store.api ? <SkillsScreen api={store.api} bots={bots} /> : null}
        {view === "tools" && store.api ? <Marketplace api={store.api} bots={bots} servers={store.mcpServers} onLoad={() => store.loadMcpServers()} /> : null}
        {view === "squads" && store.api ? (
          <SquadsScreen
            api={store.api}
            bots={bots}
            view={store.squads}
            onOpenGroup={(id) => {
              setView("chat");
              void store.selectGroup(id);
            }}
          />
        ) : null}
        {view === "hiring" && store.api ? (
          <HiringScreen
            api={store.api}
            bots={bots}
            conversations={Object.values(store.conversations)}
            rounds={store.hiring}
            onLoad={() => store.loadHiring()}
            onOpenBot={openBot}
          />
        ) : null}
        {view === "usage" && store.api ? <UsageScreen api={store.api} bots={store.bots} /> : null}
        {view === "settings" && store.api ? (
          <SettingsScreen
            api={store.api}
            bots={bots}
            onConfigureBot={(id) => {
              setView("chat");
              setPanel("settings");
              void store.selectBot(id);
            }}
          />
        ) : null}
        {view === "new-bot" && (
          <NewBotScreen
            api={store.api}
            bots={bots}
            onImport={async (yaml) => {
              const bot = await store.importBot(yaml);
              openBot(bot.id);
            }}
            onCreate={async ({ token, apiKey, ...input }) => {
              const bot = await store.createBot(input);
              // An API key goes to the new bot's vault, under the name its brain points at.
              if (apiKey && input.brain.apiKeySecret) await store.api!.put(`/api/v1/bots/${bot.id}/secrets/${input.brain.apiKeySecret}`, { value: apiKey });
              // The chat-http token is its chat API's, shared by that API's bots, encrypted in the vault, never part of the bot.
              if (token && input.brain?.baseUrl) await store.api!.put("/api/v1/chat-http/tokens", { origin: input.brain.baseUrl, value: token });
              openBot(bot.id);
            }}
          />
        )}
        {view !== "chat" ? null : group && groupActions ? (
          <>
            <GroupHeader group={group} bots={store.bots} onBack={() => void store.selectGroup(null)} actions={groupActions} />
            {actionError && (
              <p className="error banner-error" role="alert">
                {actionError}
              </p>
            )}
            {items.length === 0 && activeRuns.length === 0 ? (
              <p className="muted empty">{t("conv.startGroup", { lead: `@${store.bots[group.leadBotId ?? ""]?.handle ?? "?"}` })}</p>
            ) : (
              <Timeline
                items={items}
                bots={store.bots}
                runs={store.runs}
                activeRuns={activeRuns}
                ownBotId={null}
                hasEarlier={store.hasEarlier[group.id]}
                onLoadEarlier={() => store.loadEarlier(group.id)}
                focus={focus}
              />
            )}
            <Composer
              name={group.title}
              mentions={mentions}
              skills={skillOptions}
              transcribe={transcribe}
              prefill={shared}
              onPrefilled={() => setShared(null)}
              onSend={(text) => store.send(group.id, text)}
            />
          </>
        ) : selected && conversationId ? (
          <>
            <header className="conv-head">
              <button className="icon-btn back" aria-label={t("nav.back")} onClick={() => void store.selectBot(null)}>
                <BackIcon />
              </button>
              <Avatar bot={selected} size={32} />
              <div className="conv-title">
                <h1>
                  {selected.name} <span className="muted">@{selected.handle}</span>
                </h1>
                <div className="conv-meta">
                  {selected.role && <span>{selected.role}</span>}
                  <span className="badge" title={brainLabel(t, selected.brain.kind)} data-testid="brain-badge">
                    🧠 {brainShort(t, selected.brain.kind)}
                    {selected.brain.model ? ` · ${selected.brain.model}` : ""}
                  </span>
                  <StateLabel state={selected.state} />
                </div>
              </div>
              <div className="conv-actions">
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={t("conv.clear")}
                  title={t("conv.clear")}
                  onClick={() => {
                    if (window.confirm(t("conv.confirmClear", { name: selected.name }))) void act(() => store.clearConversation(conversationId));
                  }}
                >
                  <EraseIcon />
                </button>
                {iconButton("routines", t("routines.open"), <ClockIcon />)}
                {iconButton("settings", t("settings.open"), <GearIcon />)}
                {iconButton(
                  "computer",
                  t("computer.open"),
                  <MonitorIcon />,
                  store.computers[selected.id]?.status === "running" ? <span className="dot-running" aria-hidden="true" /> : null,
                )}
                {iconButton("details", t("panel.details"), <PanelIcon />)}
              </div>
            </header>
            {items.length === 0 && activeRuns.length === 0 ? (
              <div className="empty conv-empty">
                <Avatar bot={selected} size={72} />
                <p className="muted">{t("conv.start", { name: selected.name })}</p>
              </div>
            ) : (
              <Timeline
                items={items}
                bots={store.bots}
                runs={store.runs}
                activeRuns={activeRuns}
                ownBotId={selected.id}
                hasEarlier={conversationId ? store.hasEarlier[conversationId] : false}
                onLoadEarlier={conversationId ? () => store.loadEarlier(conversationId) : undefined}
              />
            )}
            <Composer
              name={selected.name}
              mentions={mentions}
              skills={skillOptions}
              transcribe={transcribe}
              prefill={shared}
              onPrefilled={() => setShared(null)}
              onSend={(text) => store.send(conversationId, text)}
            />
          </>
        ) : (
          <div className="empty conv-empty">
            <Mascot size={88} />
            <p className="muted">{bots.length ? t("conv.empty") : t("sidebar.noChats")}</p>
            {bots.length === 0 && (
              <button className="btn btn-primary" onClick={() => setView("new-bot")}>
                {t("sidebar.createFirst")}
              </button>
            )}
          </div>
        )}
      </main>
      {selected && panel === "details" && !group && view === "chat" && store.api && (
        <BotPanel
          key={selected.id}
          api={store.api}
          bot={selected}
          bots={store.bots}
          status={store.computers[selected.id]}
          routines={store.routines[selected.id]}
          onLoadRoutines={() => store.loadRoutines(selected.id)}
          onOpenComputer={() => setPanel("computer")}
          onOpenRoutines={() => setPanel("routines")}
          onOpenSettings={() => setPanel("settings")}
          onOpenBot={openBot}
          onExport={() => exportBot(selected)}
          onClose={() => setPanel(null)}
        />
      )}
      {selected && panel === "settings" && !group && view === "chat" && store.api && (
        <BotSettings
          key={selected.id}
          api={store.api}
          bot={selected}
          bots={bots}
          squads={store.squads?.squads}
          onSave={async (patch) => void (await store.updateBot(selected.id, patch))}
          onExport={() => exportBot(selected)}
          onDuplicate={async () => {
            const copy = await store.duplicateBot(selected.id);
            await store.selectBot(copy.id);
          }}
          onDelete={async () => {
            await store.deleteBot(selected.id);
            setPanel(null);
          }}
          onClose={() => setPanel(wide() ? "details" : null)}
        />
      )}
      {selected && panel === "routines" && !group && view === "chat" && (
        <RoutinesPanel
          bot={selected}
          routines={store.routines[selected.id]}
          onLoad={() => store.loadRoutines(selected.id)}
          onCreate={(input) => store.createRoutine(selected.id, input)}
          onAction={(routine, action, force) => store.routineAction(routine, action, force)}
          onClose={() => setPanel(wide() ? "details" : null)}
        />
      )}
      {selected && computerOpen && !group && view === "chat" && store.api && (
        <ComputerPanel
          api={store.api}
          bot={selected}
          status={store.computers[selected.id]}
          fullscreen={computerFull}
          onAction={(action) => store.computerAction(selected.id, action)}
          onFullscreen={setComputerFull}
          onClose={() => {
            setPanel(wide() ? "details" : null);
            setComputerFull(false);
          }}
        />
      )}
      {group && groupView && groupActions && view === "chat" && store.api && (
        <GroupInfoPanel
          key={group.id}
          api={store.api}
          group={group}
          bots={store.bots}
          view={groupView}
          onView={setGroupView}
          onClose={() => setGroupView(null)}
          actions={groupActions}
          onUpdate={(patch) => store.updateGroup(group.id, patch)}
          onRemoveMember={(botId) => store.removeMember(group.id, botId)}
          onOpenBot={openBot}
          onShowItem={async (itemId) => {
            if (!(await store.revealItem(group.id, itemId))) throw new Error(t("group.notFound"));
            setFocus({ itemId, at: Date.now() });
            // The flyout covers the conversation on a narrower screen: close it to show the message.
            if (!wide()) setGroupView(null);
          }}
        />
      )}
      {group && addingMembers && (
        <AddMembersDialog
          group={group}
          bots={bots}
          maxGroupSize={maxGroupSize}
          onCancel={() => setAddingMembers(false)}
          onNewBot={() => {
            setAddingMembers(false);
            setView("new-bot");
          }}
          onAdd={async (botIds) => {
            for (const botId of botIds) await store.addMember(group.id, botId);
            setAddingMembers(false);
          }}
        />
      )}
      {shared && !(view === "chat" && (group || (selected && conversationId))) && (
        <div className="share-banner" role="status" data-testid="share-banner">
          <span>
            {t("phone.shared")} <q>{shared.length > 80 ? `${shared.slice(0, 79)}…` : shared}</q>
          </span>
          <button type="button" className="icon-btn" aria-label={t("phone.sharedDismiss")} title={t("phone.sharedDismiss")} onClick={() => setShared(null)}>
            ✕
          </button>
        </div>
      )}
      {creatingGroup && (
        <NewGroupDialog
          bots={bots}
          maxGroupSize={maxGroupSize}
          onCancel={() => setCreatingGroup(false)}
          onCreate={async (input) => {
            const created = await store.createGroup(input);
            setCreatingGroup(false);
            setView("chat");
            await store.selectGroup(created.id);
          }}
        />
      )}
    </div>
  );
}
