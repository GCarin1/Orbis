// Settings → Data (specs/web-app, change 0065-export-import): download everything this hub keeps as one
// `.orbis` file (its secrets sealed by a password the user chooses), and import such a file into this hub or
// into the user's Orbis account in the cloud. Importing again adds nothing twice.
import { useState } from "react";
import type { ImportReport } from "@orbis/shared";
import type { Api } from "../api.js";
import { authConfig, signIn, type AccountSession } from "../account.js";
import { useT, type TextKey } from "../i18n.js";
import { saveBlobFile } from "../native.js";

const MIN_PASSWORD = 10;

function Report({ report }: { report: ImportReport }) {
  const t = useT();
  const rows = Object.entries(report.tables).filter(([, c]) => c.added || c.skipped);
  return (
    <div className="import-report" data-testid="import-report">
      <p>{t(report.target === "cloud" ? "data.reportCloud" : "data.reportHub", { date: new Date(report.exportedAt).toLocaleDateString() })}</p>
      <div className="table-scroll">
        <table className="usage-table">
          <thead>
            <tr>
              <th>{t("data.col.what")}</th>
              <th>{t("data.col.added")}</th>
              <th>{t("data.col.there")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([table, c]) => (
              <tr key={table}>
                <td>{t(`data.table.${table}` as TextKey)}</td>
                <td>{c.added}</td>
                <td>{c.skipped}</td>
              </tr>
            ))}
            {report.target === "hub" && (
              <>
                <tr>
                  <td>{t("data.table.files")}</td>
                  <td>{report.files.added}</td>
                  <td>{report.files.skipped}</td>
                </tr>
                <tr>
                  <td>{t("data.table.skills")}</td>
                  <td>{report.skills.added}</td>
                  <td>{report.skills.skipped}</td>
                </tr>
                <tr>
                  <td>{t("data.table.secrets")}</td>
                  <td>{report.secrets.added}</td>
                  <td>{report.secrets.skipped}</td>
                </tr>
              </>
            )}
          </tbody>
        </table>
      </div>
      {report.warnings.length > 0 && (
        <ul className="muted small">
          {report.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function DataSettings({ api, account = null, onImported = () => undefined }: { api: Api; account?: AccountSession | null; onImported?(): void }) {
  const t = useT();
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [withSecrets, setWithSecrets] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [filePassword, setFilePassword] = useState("");
  const [target, setTarget] = useState<"hub" | "cloud">("hub");
  const [email, setEmail] = useState("");
  const [accountPassword, setAccountPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);

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

  const download = () =>
    act(async () => {
      if (withSecrets && password !== again) throw new Error(t("account.mismatch"));
      const blob = await api.exportData(withSecrets ? password : null);
      await saveBlobFile(`orbis-${new Date().toISOString().slice(0, 10)}.orbis`, blob);
      setPassword("");
      setAgain("");
      return withSecrets ? t("data.exportedSealed") : t("data.exported");
    });

  const runImport = () =>
    act(async () => {
      if (!file) return;
      setReport(null);
      let cloudSession: string | undefined;
      if (target === "cloud") {
        if (account) cloudSession = await account.token();
        else {
          const project = (await authConfig())?.supabase;
          if (!project) throw new Error(t("account.off"));
          cloudSession = (await signIn(project, email, accountPassword)).accessToken;
        }
      }
      const result = await api.importData(file, { password: target === "hub" ? filePassword : null, cloudSession });
      setReport(result);
      setAccountPassword("");
      onImported();
    });

  const exportReady = !withSecrets || (password.length >= MIN_PASSWORD && again.length > 0);
  const importReady = Boolean(file) && (target === "hub" || account !== null || (email.trim() !== "" && accountPassword !== ""));
  return (
    <div className="data-settings" data-testid="data-settings">
      <h2>{t("data.title")}</h2>
      <p className="muted">{t("data.intro")}</p>

      <section className="health-card" data-testid="data-export">
        <h3>{t("data.exportTitle")}</h3>
        <p className="muted small">{t("data.exportHelp")}</p>
        <div className="account-form">
          <label className="checkbox">
            <input type="checkbox" checked={withSecrets} onChange={(e) => setWithSecrets(e.target.checked)} />
            {t("data.withSecrets")}
          </label>
          {withSecrets && (
            <>
              <label>
                {t("data.exportPassword")}
                <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
              </label>
              <label>
                {t("account.passwordAgain")}
                <input type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} />
              </label>
              <p className="muted small">{t("data.passwordRule", { min: MIN_PASSWORD })}</p>
            </>
          )}
          <button type="button" className="btn btn-primary" disabled={busy || !exportReady} onClick={() => void download()}>
            {t("data.download")}
          </button>
        </div>
      </section>

      <section className="health-card" data-testid="data-import">
        <h3>{t("data.importTitle")}</h3>
        <p className="muted small">{t("data.importHelp")}</p>
        <div className="account-form">
          <label>
            {t("data.file")}
            <input type="file" accept=".orbis,application/zip" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>
          <div className="segmented" role="tablist">
            <button type="button" role="tab" aria-selected={target === "hub"} className={target === "hub" ? "on" : ""} onClick={() => setTarget("hub")}>
              {t("data.toHub")}
            </button>
            <button type="button" role="tab" aria-selected={target === "cloud"} className={target === "cloud" ? "on" : ""} onClick={() => setTarget("cloud")}>
              {t("data.toCloud")}
            </button>
          </div>
          {target === "hub" ? (
            <label>
              {t("data.filePassword")}
              <input type="password" autoComplete="off" value={filePassword} onChange={(e) => setFilePassword(e.target.value)} />
            </label>
          ) : account ? (
            <p className="muted small">{t("data.cloudAs", { email: account.user.email ?? account.user.id })}</p>
          ) : (
            <>
              <p className="muted small">{t("data.cloudSignIn")}</p>
              <label>
                {t("account.email")}
                <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </label>
              <label>
                {t("account.password")}
                <input type="password" autoComplete="current-password" value={accountPassword} onChange={(e) => setAccountPassword(e.target.value)} />
              </label>
            </>
          )}
          {target === "cloud" && <p className="muted small">{t("data.cloudSecrets")}</p>}
          <button type="button" className="btn btn-primary" disabled={busy || !importReady} onClick={() => void runImport()}>
            {busy ? t("data.importing") : t("data.import")}
          </button>
        </div>
        {report && <Report report={report} />}
      </section>

      {message && (
        <p className={message.ok ? "muted" : "error"} role="status">
          {message.text}
        </p>
      )}
    </div>
  );
}
