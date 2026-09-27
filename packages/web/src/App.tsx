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

export function App() {
  const t = useT();
  const [token, setToken] = useState<string | null>(() => {
    captureTokenFromUrl();
    return loadToken();
  });
  const [creating, setCreating] = useState(false);
  const store = useStore();

  useEffect(() => {
    if (!token) return;
    store.setApi(new Api(token));
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
        const conv = s.selectedBotId ? s.directByBot[s.selectedBotId] : undefined;
        if (conv) void s.loadTimeline(conv);
      },
    });
    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const bots = useMemo(() => Object.values(store.bots), [store.bots]);
  const selected = store.selectedBotId ? store.bots[store.selectedBotId] : undefined;
  const conversationId = selected ? store.directByBot[selected.id] : undefined;
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
    <div className="layout">
      <aside className="sidebar">
        <header className="brand">
          <img src="/icon.svg" alt="" width={28} height={28} />
          <span>Orbis</span>
          <LanguageSwitch />
        </header>
        <Roster bots={bots} selectedId={store.selectedBotId} onSelect={(id) => void store.selectBot(id)} onNew={() => setCreating(true)} />
      </aside>
      <main className="main">
        {!store.connected && <div className="banner">{t("stream.offline")}</div>}
        {selected && conversationId ? (
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
            </header>
            {items.length === 0 && activeRuns.length === 0 ? (
              <p className="muted empty">{t("conv.start", { name: selected.name })}</p>
            ) : (
              <Timeline items={items} bots={store.bots} runs={store.runs} activeRuns={activeRuns} />
            )}
            <Composer name={selected.name} onSend={(text) => store.send(conversationId, text)} />
          </>
        ) : (
          <p className="muted empty">{t("conv.empty")}</p>
        )}
      </main>
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
