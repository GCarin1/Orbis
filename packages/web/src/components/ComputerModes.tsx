// The three kinds of computer (specs/web-app, specs/computer): a private folder
// on the Orbis machine, the user's own computer in a folder they choose, or a
// container with a desktop — what each one needs, the one-click build of the
// desktop image, and the per-bot choice.
import { useCallback, useEffect, useState } from "react";
import type { ComputerProviderKind, ComputerProvidersInfo } from "@orbis/shared";
import type { Api } from "../api.js";
import { useT, type TextKey } from "../i18n.js";

export const MODE_ICONS: Record<ComputerProviderKind, string> = { local: "📁", host: "💻", docker: "🐳" };
const MODES: ComputerProviderKind[] = ["local", "host", "docker"];

/** What the hub's machine offers; polls while the desktop image is being built. */
export function useComputers(api: Api | null | undefined) {
  const [info, setInfo] = useState<ComputerProvidersInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(() => {
    if (!api) return;
    api
      .get<ComputerProvidersInfo>("/api/v1/computers")
      .then((next) => {
        setInfo(next);
        setError(null);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  }, [api]);
  useEffect(() => reload(), [reload]);
  const building = info?.docker.build.state === "building";
  useEffect(() => {
    if (!building) return;
    const timer = setInterval(reload, 2_000);
    return () => clearInterval(timer);
  }, [building, reload]);
  return { info, error, reload };
}

/** Docker's state here and the button that builds the desktop image. */
export function DockerStatus({ api, info, reload }: { api: Api | null | undefined; info: ComputerProvidersInfo | null; reload(): void }) {
  const t = useT();
  const [error, setError] = useState<string | null>(null);
  if (!info) return <p className="muted small">…</p>;
  const d = info.docker;
  const build = async () => {
    setError(null);
    try {
      await api?.post("/api/v1/computers/docker/image");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
    reload();
  };
  return (
    <div className="docker-status" data-testid="docker-status">
      <p>
        <span className={`badge ${d.available ? "ok" : "off"}`}>
          {d.available
            ? `✓ ${t("computers.dockerOn", { version: d.version ?? "?" })}`
            : d.installed
              ? `✗ ${t("computers.dockerStopped")}`
              : `✗ ${t("computers.dockerMissing")}`}
        </span>{" "}
        {d.available && (
          <span className={`badge ${d.imagePresent ? "ok" : "off"}`}>
            {d.imagePresent ? `✓ ${t("computers.imageReady")}` : `✗ ${t("computers.imageMissing")}`}
          </span>
        )}
      </p>
      {!d.available && <p className="muted small">{t(d.installed ? "computers.dockerStartHelp" : "computers.dockerInstallHelp")}</p>}
      {d.error && !d.available && d.installed && <p className="muted small">{d.error}</p>}
      {d.available && !d.imagePresent && d.build.state !== "building" && (
        <p className="muted small">{d.canBuild ? t("computers.buildHelp") : t("computers.noDockerfile")}</p>
      )}
      <div className="card-actions">
        {d.available && d.canBuild && (
          <button type="button" className="btn" disabled={d.build.state === "building"} onClick={() => void build()}>
            {d.build.state === "building" ? t("computers.building") : d.imagePresent ? t("computers.rebuild") : t("computers.build")}
          </button>
        )}
        <button type="button" className="btn" onClick={reload}>
          ↻ {t("brains.refresh")}
        </button>
      </div>
      {d.build.state === "done" && <p className="brain-test answered">{t("computers.built")}</p>}
      {d.build.state === "failed" && <p className="brain-test failed">{t("computers.buildFailed", { error: d.build.error ?? "?" })}</p>}
      {(d.build.state === "building" || d.build.state === "failed") && d.build.log && <pre className="build-log">{d.build.log}</pre>}
      {error && <p className="error">{error}</p>}
    </div>
  );
}

/** The per-bot choice: three cards, the folder for `host` and the consent to give it. */
export function ComputerChoice({
  api,
  provider,
  hostDir,
  needsConsent,
  consent,
  onProvider,
  onHostDir,
  onConsent,
}: {
  api: Api | null | undefined;
  /** The bot's choice; "" follows the hub's default. */
  provider: ComputerProviderKind | "";
  hostDir: string;
  /** The bot does not have the user's computer yet: they must agree before saving. */
  needsConsent: boolean;
  consent: boolean;
  onProvider(kind: ComputerProviderKind): void;
  onHostDir(dir: string): void;
  onConsent(ok: boolean): void;
}) {
  const t = useT();
  const { info, reload } = useComputers(api);
  const shown = provider || info?.default || "local";
  return (
    <div className="computer-choice">
      <div className="mode-cards" role="radiogroup" aria-label={t("settings.provider")}>
        {MODES.map((mode) => (
          <button
            key={mode}
            type="button"
            role="radio"
            aria-checked={shown === mode}
            className={`mode-card${shown === mode ? " on" : ""}`}
            onClick={() => onProvider(mode)}
            data-testid={`mode-${mode}`}
          >
            <span className="mode-icon" aria-hidden="true">
              {MODE_ICONS[mode]}
            </span>
            <strong>{t(`computers.${mode}.title` as TextKey)}</strong>
            <span className="muted small">{t(`computers.${mode}.pitch` as TextKey)}</span>
          </button>
        ))}
      </div>
      {shown === "host" && (
        <div className="mode-detail">
          <label>
            {t("computers.hostDir")}
            <input value={hostDir} onChange={(e) => onHostDir(e.target.value)} placeholder={info?.host.home ?? ""} name="settings-host-dir" />
          </label>
          <p className="muted small">{t("computers.hostHelp")}</p>
          {needsConsent && (
            <label className="checkbox consent">
              <input type="checkbox" checked={consent} onChange={(e) => onConsent(e.target.checked)} name="settings-host-consent" />
              {t("computers.consent")}
            </label>
          )}
        </div>
      )}
      {shown === "docker" && (
        <div className="mode-detail">
          <DockerStatus api={api} info={info} reload={reload} />
        </div>
      )}
    </div>
  );
}

/** The settings tab: what each kind of computer is and needs here. */
export function ComputersSettings({ api }: { api: Api }) {
  const t = useT();
  const { info, error, reload } = useComputers(api);
  return (
    <div className="settings-section" data-testid="computers-settings">
      <p className="muted">{t("computers.help")}</p>
      {error && <p className="error">{error}</p>}
      {MODES.map((mode) => (
        <article key={mode} className="brain-card mode-summary" data-testid={`computers-${mode}`}>
          <header>
            <strong>
              {MODE_ICONS[mode]} {t(`computers.${mode}.title` as TextKey)}
            </strong>
            {info?.default === mode && <span className="badge">{t("computers.default")}</span>}
          </header>
          <p className="small">{t(`computers.${mode}.about` as TextKey)}</p>
          {mode === "host" && info && (
            <p className="muted small">
              {t("computers.hostHome", { home: info.host.home })} {info.host.visibleBrowser ? "" : t("computers.noScreen")}
            </p>
          )}
          {mode === "docker" && <DockerStatus api={api} info={info} reload={reload} />}
        </article>
      ))}
      <p className="muted small">{t("computers.perBot")}</p>
    </div>
  );
}
