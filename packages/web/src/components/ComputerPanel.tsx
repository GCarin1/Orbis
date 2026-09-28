// A bot's computer beside its conversation, or full screen (specs/computer: the
// three-level view — roster ring, side panel, full screen).
import { useEffect, useState } from "react";
import type { Bot, ComputerStatus } from "@orbis/shared";
import type { Api } from "../api.js";
import { useT, type TextKey } from "../i18n.js";

type Action = "start" | "stop" | "takeover" | "release";

/** The live view: noVNC for a desktop, else the latest browser screenshot (refreshed on each new one). */
function LiveView({ api, bot, status }: { api: Api; bot: Bot; status: ComputerStatus }) {
  const t = useT();
  const [image, setImage] = useState<string | null>(null);
  const [vncUrl, setVncUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!status.vncPath) {
      setVncUrl(null);
      return;
    }
    let live = true;
    void api
      .post<{ url: string }>(`/api/v1/bots/${bot.id}/computer/vnc-session`)
      .then((r) => live && setVncUrl(r.url))
      .catch(() => live && setVncUrl(null));
    return () => {
      live = false;
    };
  }, [api, bot.id, status.vncPath]);

  // Fetch the screenshot again whenever the hub announces a new one; the previous
  // image stays on screen until the next one has arrived.
  useEffect(() => {
    if (status.vncPath) return;
    let live = true;
    void api
      .blob(`/api/v1/bots/${bot.id}/computer/screenshot`)
      .then((blob) => {
        if (!live || !blob) return;
        const next = URL.createObjectURL(blob);
        setImage((previous) => {
          if (previous) URL.revokeObjectURL(previous);
          return next;
        });
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [api, bot.id, status.vncPath, status.screenshotAt]);
  useEffect(
    () => () =>
      setImage((previous) => {
        if (previous) URL.revokeObjectURL(previous);
        return null;
      }),
    [bot.id],
  );

  if (vncUrl) return <iframe className="computer-screen" src={vncUrl} title={t("computer.title", { name: bot.name })} data-testid="computer-vnc" />;
  if (image) return <img className="computer-screen" src={image} alt={t("computer.title", { name: bot.name })} data-testid="computer-screenshot" />;
  return <p className="muted computer-empty">{t("computer.noScreen", { name: bot.name })}</p>;
}

export function ComputerPanel({
  api,
  bot,
  status,
  fullscreen,
  onAction,
  onFullscreen,
  onClose,
}: {
  api: Api;
  bot: Bot;
  status: ComputerStatus | undefined;
  fullscreen: boolean;
  onAction(action: Action): Promise<void>;
  onFullscreen(on: boolean): void;
  onClose(): void;
}) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const act = async (action: Action) => {
    setBusy(true);
    setError(null);
    try {
      await onAction(action);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside className={`computer-panel${fullscreen ? " fullscreen" : ""}`} aria-label={t("computer.title", { name: bot.name })} data-testid="computer-panel">
      <header className="computer-head">
        <div>
          <h2>{t("computer.title", { name: bot.name })}</h2>
          {status && (
            <span className="muted">
              <span className={`pill pill-computer-${status.status}`}>{t(`computer.status.${status.status}` as TextKey)}</span>{" "}
              {t("computer.provider", { provider: t(`computers.${status.provider}.title` as TextKey) })}
            </span>
          )}
        </div>
        <div className="computer-tools">
          <button className="btn" onClick={() => onFullscreen(!fullscreen)}>
            {fullscreen ? t("computer.exitFullscreen") : t("computer.fullscreen")}
          </button>
          <button className="btn" onClick={onClose} aria-label={t("computer.close")}>
            ✕
          </button>
        </div>
      </header>
      {status && !status.enabled ? (
        <p className="muted computer-empty">{t("computer.disabled")}</p>
      ) : status ? (
        <>
          {status.takeover && (
            <div className="banner banner-takeover" role="status">
              {t("computer.takeoverActive", { name: bot.name })}
              {status.provider === "local" && <div className="muted">{t("computer.localTakeover")}</div>}
              {status.provider === "host" && <div className="muted">{t("computer.hostTakeover")}</div>}
            </div>
          )}
          <div className="computer-actions">
            {status.status === "running" ? (
              <button className="btn" disabled={busy} onClick={() => void act("stop")}>
                {t("computer.stop")}
              </button>
            ) : (
              <button className="btn" disabled={busy} onClick={() => void act("start")}>
                {t("computer.start")}
              </button>
            )}
            {status.takeover ? (
              <button className="btn btn-primary" disabled={busy} onClick={() => void act("release")}>
                {t("computer.release")}
              </button>
            ) : (
              <button className="btn" disabled={busy} onClick={() => void act("takeover")}>
                {t("computer.takeover")}
              </button>
            )}
          </div>
          {error && <p className="error">{error}</p>}
          <LiveView api={api} bot={bot} status={status} />
          {status.provider === "local" && <p className="muted computer-note">{t("computer.localWarning")}</p>}
          {status.provider === "host" && <p className="muted computer-note">{t("computer.hostNote", { dir: bot.computer.hostDir ?? "~" })}</p>}
        </>
      ) : null}
    </aside>
  );
}
