import { useEffect, useMemo, useState } from "react";
import { Api, captureTokenFromUrl, loadToken, openStream, saveToken } from "./api.js";
import { useT } from "./i18n.js";
import { useStore } from "./store.js";
import { Avatar, StateLabel } from "./components/Avatar.js";
import { Composer } from "./components/Composer.js";
import { LanguageSwitch } from "./components/LanguageSwitch.js";
import { NewBotDialog } from "./components/NewBotDialog.js";
import { Roster } from "./components/Roster.js";
import { Timeline } from "./components/Timeline.js";
import { TokenGate } from "./components/TokenGate.js";
import { ApprovalsInbox } from "./components/ApprovalsInbox.js";
import { GroupList, NewGroupDialog } from "./components/Groups.js";
import { ComputerPanel } from "./components/ComputerPanel.js";
import { RoutinesPanel } from "./components/RoutinesPanel.js";
import { SkillsScreen } from "./components/SkillsScreen.js";
import { UsageScreen } from "./components/UsageScreen.js";
import type { SkillOption } from "./components/Composer.js";
import type { MentionOption } from "./components/Composer.js";

export function App() {
  const t = useT();
  const [token, setToken] = useState<string | null>(() => {
    captureTokenFromUrl();
    return loadToken();
  });
  const [creating, setCreating] = useState(false);
  const [creatingGroup, setCreatingGroup] = useState(false);
  // One side panel at a time beside a direct conversation.
  const [panel, setPanel] = useState<"computer" | "routines" | null>(null);
  const computerOpen = panel === "computer";
  const setComputerOpen = (open: boolean) => setPanel(open ? "computer" : null);
  const [view, setView] = useState<"chat" | "skills" | "usage">("chat");
  const [computerFull, setComputerFull] = useState(false);
  const store = useStore();

  useEffect(() => {
    if (!token) return;
    store.setApi(new Api(token));
    void useStore.getState().loadApprovals().catch(() => undefined);
    void useStore.getState().loadConversations().catch(() => undefined);
    void useStore.getState().loadBots().catch((err: unknown) => {
      if ((err as { status?: number }).status === 401) {
        saveToken(null);
        setToken(null);
      }
    });
    const stop = openStream(token, {
      onEvent: (e) => useStore.getState().apply(e),
      onStatus: (c) => useStore.getState().setConnected(c),
      onReconnect: () => {
        const s = useStore.getState();
        void s.loadBots();
        void s.loadApprovals();
        void s.loadConversations();
        const conv = s.selectedGroupId ?? (s.selectedBotId ? s.directByBot[s.selectedBotId] : undefined);
        if (conv) void s.loadTimeline(conv);
      },
    });
    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const bots = useMemo(() => Object.values(store.bots), [store.bots]);
  const selected = store.selectedBotId ? store.bots[store.selectedBotId] : undefined;
  useEffect(() => {
    if (computerOpen && selected) void useStore.getState().loadComputer(selected.id).catch(() => undefined);
  }, [computerOpen, selected?.id]);
  const group = store.selectedGroupId ? store.conversations[store.selectedGroupId] : undefined;
  const groups = useMemo(() => Object.values(store.conversations).filter((c) => c.kind === "group"), [store.conversations]);
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
  // `@` autocomplete: the members (and @everyone) in a group, every visible bot in a direct chat.
  const mentionPool = group ? group.members.map((id) => store.bots[id]).filter((b) => b !== undefined) : bots.filter((b) => !b.hidden);
  const mentions: MentionOption[] = mentionPool.map((b) => ({ handle: b.handle, label: b.role ? `${b.name} — ${b.role}` : b.name, bot: b }));
  if (group) mentions.push({ handle: "everyone", label: t("mention.everyone") });
  const items = conversationId ? (store.items[conversationId] ?? []) : [];
  const activeRuns = useMemo(
    () =>
      Object.values(store.runs).filter(
        (r) => r.conversationId === conversationId && (r.status === "running" || r.status === "queued" || r.status === "waiting"),
      ),
    [store.runs, conversationId],
  );

  if (!token) {
    return (
      <TokenGate
        onToken={(value) => {
          saveToken(value);
          setToken(value);
        }}
      />
    );
  }

  return (
    <div className={`layout${selected && panel && !group && view === "chat" ? " with-computer" : ""}`}>
      <aside className="sidebar">
        <header className="brand">
          <img src="/icon.svg" alt="" width={34} height={34} />
          <span className="wordmark" title={t("brand.tagline")}>
            Orbis
          </span>
          <LanguageSwitch />
        </header>
        <nav className="main-nav" aria-label="Orbis">
          <button className={`nav-item${view === "chat" ? " selected" : ""}`} aria-pressed={view === "chat"} onClick={() => setView("chat")}>
            💬 {t("nav.chat")}
          </button>
          <button className={`nav-item${view === "skills" ? " selected" : ""}`} aria-pressed={view === "skills"} onClick={() => setView("skills")}>
            📘 {t("nav.skills")}
          </button>
          <button className={`nav-item${view === "usage" ? " selected" : ""}`} aria-pressed={view === "usage"} onClick={() => setView("usage")}>
            📊 {t("nav.usage")}
          </button>
        </nav>
        <ApprovalsInbox
          approvals={Object.values(store.approvals)}
          bots={store.bots}
          onOpen={(id) => {
            setView("chat");
            void store.selectBot(id);
          }}
        />
        <GroupList
          groups={groups}
          bots={store.bots}
          selectedId={store.selectedGroupId}
          onSelect={(id) => {
            setView("chat");
            void store.selectGroup(id);
          }}
          onNew={() => setCreatingGroup(true)}
        />
        <Roster
          bots={bots}
          selectedId={store.selectedBotId}
          onSelect={(id) => {
            setView("chat");
            void store.selectBot(id);
          }}
          onNew={() => setCreating(true)}
        />
      </aside>
      <main className="main">
        {view === "skills" && store.api ? <SkillsScreen api={store.api} bots={bots} /> : null}
        {view === "usage" && store.api ? <UsageScreen api={store.api} bots={store.bots} /> : null}
        {!store.connected && <div className="banner">{t("stream.offline")}</div>}
        {view !== "chat" ? null : group ? (
          <>
            <header className="conv-head">
              <span className="avatar-stack">
                {group.members.map((id) => (store.bots[id] ? <Avatar key={id} bot={store.bots[id]!} size={32} /> : null))}
              </span>
              <div>
                <h1>{group.title}</h1>
                <div className="conv-meta">
                  <span>{t("groups.members", { count: group.members.length })}</span>
                  {group.members.map((id) => {
                    const member = store.bots[id];
                    if (!member) return null;
                    return (
                      <span key={id} className="member-chip">
                        @{member.handle}
                        {id === group.leadBotId && <span className="badge">{t("groups.lead")}</span>} <StateLabel state={member.state} />
                      </span>
                    );
                  })}
                </div>
              </div>
            </header>
            {items.length === 0 && activeRuns.length === 0 ? (
              <p className="muted empty">{t("conv.startGroup", { lead: `@${store.bots[group.leadBotId ?? ""]?.handle ?? "?"}` })}</p>
            ) : (
              <Timeline items={items} bots={store.bots} runs={store.runs} activeRuns={activeRuns} />
            )}
            <Composer name={group.title} mentions={mentions} skills={skillOptions} onSend={(text) => store.send(group.id, text)} />
          </>
        ) : selected && conversationId ? (
          <>
            <header className="conv-head">
              <Avatar bot={selected} size={44} />
              <div>
                <h1>
                  {selected.name} <span className="muted">@{selected.handle}</span>
                </h1>
                <div className="conv-meta">
                  {selected.role && <span>{selected.role}</span>}
                  <span className="badge">{selected.brain.kind}</span>
                  <StateLabel state={selected.state} />
                </div>
              </div>
              <div className="conv-actions">
                <button className="btn" aria-pressed={panel === "routines"} onClick={() => setPanel(panel === "routines" ? null : "routines")}>
                  ⏰ {t("routines.open")}
                </button>
                <button className="btn conv-computer" aria-pressed={computerOpen} onClick={() => setComputerOpen(!computerOpen)}>
                  🖥 {t("computer.open")}
                  {store.computers[selected.id]?.status === "running" && <span className="dot-running" aria-hidden="true" />}
                </button>
              </div>
            </header>
            {items.length === 0 && activeRuns.length === 0 ? (
              <p className="muted empty">{t("conv.start", { name: selected.name })}</p>
            ) : (
              <Timeline items={items} bots={store.bots} runs={store.runs} activeRuns={activeRuns} />
            )}
            <Composer name={selected.name} mentions={mentions} skills={skillOptions} onSend={(text) => store.send(conversationId, text)} />
          </>
        ) : (
          <p className="muted empty">{t("conv.empty")}</p>
        )}
      </main>
      {selected && panel === "routines" && !group && view === "chat" && (
        <RoutinesPanel
          bot={selected}
          routines={store.routines[selected.id]}
          onLoad={() => store.loadRoutines(selected.id)}
          onCreate={(input) => store.createRoutine(selected.id, input)}
          onAction={(routine, action, force) => store.routineAction(routine, action, force)}
          onClose={() => setPanel(null)}
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
            setComputerOpen(false);
            setComputerFull(false);
          }}
        />
      )}
      {creatingGroup && (
        <NewGroupDialog
          bots={bots}
          onCancel={() => setCreatingGroup(false)}
          onCreate={async (input) => {
            const created = await store.createGroup(input);
            setCreatingGroup(false);
            await store.selectGroup(created.id);
          }}
        />
      )}
      {creating && (
        <NewBotDialog
          onCancel={() => setCreating(false)}
          onCreate={async (input) => {
            const bot = await store.createBot(input);
            setCreating(false);
            await store.selectBot(bot.id);
          }}
        />
      )}
    </div>
  );
}
