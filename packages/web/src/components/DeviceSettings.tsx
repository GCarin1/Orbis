// Settings → Account, the devices (specs/web-app, change 0066-runner-link): this hub as a device of the Orbis
// account (linked with the account's email and password, what it sends, sending now, unlinking), and the
// account's devices, each revocable — read with the account's own session.
import { useEffect, useState } from "react";
import type { AuthConfig, DeviceStatus } from "@orbis/shared";
import type { Api } from "../api.js";
import { authConfig, signIn, type AccountSession } from "../account.js";
import { useLang, useT } from "../i18n.js";

interface CloudDevice {
  id: string;
  name: string;
  last_seen_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

type Project = NonNullable<AuthConfig["supabase"]>;

async function rest<T>(project: Project, session: string, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${project.url}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: project.key, authorization: `Bearer ${session}`, "content-type": "application/json", ...(init.headers as Record<string, string> | undefined) },
  });
  const text = await res.text();
  const body = text ? (JSON.parse(text) as unknown) : null;
  if (!res.ok) throw new Error((body as { message?: string } | null)?.message ?? `HTTP ${res.status}`);
  return body as T;
}

export function DeviceSettings({ api, account = null }: { api: Api; account?: AccountSession | null }) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString(lang, { dateStyle: "short", timeStyle: "short" }) : "—");
  const [status, setStatus] = useState<DeviceStatus | null>(null);
  const [name, setName] = useState("Orbis no celular");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [devices, setDevices] = useState<CloudDevice[] | null>(null);
  const [listSession, setListSession] = useState<string | null>(null);
  const [project, setProject] = useState<Project | null>(null);

  useEffect(() => {
    void api
      .get<DeviceStatus>("/api/v1/device")
      .then(setStatus)
      .catch(() => setStatus(null));
    void authConfig().then((c) => setProject(c?.supabase ?? null));
  }, [api]);

  const act = async (fn: () => Promise<string | void>) => {
    setBusy(true);
    setMessage(null);
    try {
      const done = await fn();
      if (done) setMessage({ ok: true, text: done });
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  };

  const link = () =>
    act(async () => {
      setStatus(await api.post<DeviceStatus>("/api/v1/device/link", { name: name.trim(), email: email.trim(), password }));
      setPassword("");
      return t("device.linkedNow");
    });
  const syncNow = () => act(async () => void setStatus(await api.post<DeviceStatus>("/api/v1/device/sync", {})));
  const unlink = () => {
    if (!window.confirm(t("device.confirmUnlink"))) return;
    void act(async () => {
      setStatus(await api.delete<DeviceStatus>("/api/v1/device"));
      return t("device.unlinked");
    });
  };

  const sessionForList = async (): Promise<string> => {
    if (account) return account.token();
    if (listSession) return listSession;
    if (!project) throw new Error(t("account.off"));
    const s = (await signIn(project, email, password)).accessToken;
    setListSession(s);
    return s;
  };
  const loadDevices = () =>
    act(async () => {
      if (!project) throw new Error(t("account.off"));
      setDevices(await rest<CloudDevice[]>(project, await sessionForList(), "devices?select=id,name,last_seen_at,revoked_at,created_at&order=created_at.desc"));
    });
  const revoke = (d: CloudDevice) => {
    if (!window.confirm(t("device.confirmRevoke", { name: d.name }))) return;
    void act(async () => {
      if (!project) return;
      const session = await sessionForList();
      await rest(project, session, `devices?id=eq.${encodeURIComponent(d.id)}`, { method: "PATCH", body: JSON.stringify({ revoked_at: new Date().toISOString() }), headers: { prefer: "return=minimal" } });
      setDevices(await rest<CloudDevice[]>(project, session, "devices?select=id,name,last_seen_at,revoked_at,created_at&order=created_at.desc"));
      return t("device.revoked", { name: d.name });
    });
  };

  if (!status?.available) return null;
  const linked = status.linked;
  return (
    <div className="device-settings" data-testid="device-settings">
      <section className="health-card" data-testid="device-this">
        <h3>{t("device.title")}</h3>
        <p className="muted small">{t("device.intro")}</p>
        {linked ? (
          <>
            <p>{t("device.linkedAs", { name: linked.name, email: linked.email ?? linked.ownerId })}</p>
            {status.revoked ? (
              <p className="error">{t("device.revokedHere")}</p>
            ) : (
              <p className="muted small">{t("device.state", { pending: status.pending, when: when(status.lastSyncAt) })}</p>
            )}
            {status.lastError && !status.revoked && <p className="error small">{status.lastError}</p>}
            <div className="card-actions">
              {!status.revoked && (
                <button type="button" className="btn" disabled={busy} onClick={() => void syncNow()}>
                  {t("device.syncNow")}
                </button>
              )}
              <button type="button" className="btn btn-danger" disabled={busy} onClick={unlink}>
                {t("device.unlink")}
              </button>
            </div>
          </>
        ) : (
          <form
            className="account-form"
            onSubmit={(e) => {
              e.preventDefault();
              void link();
            }}
          >
            <label>
              {t("device.name")}
              <input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
            </label>
            <label>
              {t("account.email")}
              <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <label>
              {t("account.password")}
              <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </label>
            <button type="submit" className="btn btn-primary" disabled={busy || !name.trim() || !email.trim() || !password}>
              {t("device.link")}
            </button>
          </form>
        )}
      </section>

      <section className="health-card" data-testid="device-list">
        <h3>{t("device.listTitle")}</h3>
        <p className="muted small">{account || listSession ? t("device.listHelp") : t("device.listSignIn")}</p>
        <button type="button" className="btn" disabled={busy || (!account && !listSession && (!email.trim() || !password))} onClick={() => void loadDevices()}>
          {t("device.showList")}
        </button>
        {devices && (
          <ul className="device-list">
            {devices.length === 0 && <li className="muted">{t("device.none")}</li>}
            {devices.map((d) => (
              <li key={d.id}>
                <strong>{d.name}</strong>{" "}
                <span className="muted small">
                  {d.revoked_at ? t("device.revokedOn", { when: when(d.revoked_at) }) : t("device.seen", { when: when(d.last_seen_at) })}
                  {linked?.id === d.id ? ` · ${t("device.thisOne")}` : ""}
                </span>{" "}
                {!d.revoked_at && (
                  <button type="button" className="btn btn-danger" disabled={busy} onClick={() => revoke(d)}>
                    {t("device.revoke")}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {message && (
        <p className={message.ok ? "muted" : "error"} role="status">
          {message.text}
        </p>
      )}
    </div>
  );
}
