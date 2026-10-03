// Claude Code's login, from the settings screen (specs/web-app, specs/agent-runtimes):
// the subscription brain runs on the login the `claude` program keeps, and that
// login expires. This shows whether it is signed in, signs in again (the browser
// opens on this computer; a page and the code it shows work from any device) and,
// when a test failed because the login expired, says so. On a server, the
// subscription token `claude setup-token` prints stands in for the sign-in.
import { useCallback, useEffect, useState } from "react";
import type { ClaudeAccount, ClaudeTokenStatus } from "@orbis/shared";
import type { Api } from "../api.js";
import { useLang, useT } from "../i18n.js";

/** The subscription token: whether one is saved and until about when, and a masked field to save, replace or remove it. */
function ClaudeToken({ api, status, onChange }: { api: Api; status: ClaudeTokenStatus; onChange(): void }) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const date = (iso: string) => new Date(iso).toLocaleDateString(lang, { day: "numeric", month: "short", year: "numeric" });
  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setToken("");
      onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <details className="claude-token" data-testid="claude-token" open={status.saved || undefined}>
      <summary>{t("claude.tokenTitle")}</summary>
      <p className="small">
        {status.source === "saved" && status.savedAt
          ? t("claude.tokenSaved", { date: date(status.savedAt), until: status.expiresAround ? date(status.expiresAround) : "—" })
          : status.source === "server"
            ? t("claude.tokenServer")
            : t("claude.tokenNone")}
      </p>
      <p className="muted small">{t("claude.tokenHelp")}</p>
      {status.saved && <p className="muted small">{t("claude.tokenWins")}</p>}
      <form
        className="claude-token-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (token.trim()) void act(() => api.put("/api/v1/runtimes/claude/token", { token: token.trim() }));
        }}
      >
        <label>
          {t("claude.tokenLabel")}
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            placeholder="sk-ant-oat…"
            name="claude-subscription-token"
          />
        </label>
        <div className="card-actions">
          <button type="submit" className="btn btn-primary" disabled={busy || !token.trim()}>
            {status.source === "saved" ? t("claude.tokenReplace") : t("claude.tokenSave")}
          </button>
          {status.source === "saved" && (
            <button type="button" className="btn" disabled={busy} onClick={() => void act(() => api.delete("/api/v1/runtimes/claude/token"))}>
              {t("claude.tokenRemove")}
            </button>
          )}
        </div>
      </form>
      {error && (
        <p className="error small" role="alert">
          {error}
        </p>
      )}
    </details>
  );
}

export function ClaudeSignIn({
  api,
  expired,
  onSignedIn,
}: {
  api: Api;
  /** A test of this brain failed because its login expired. */ expired: boolean;
  onSignedIn?(): void;
}) {
  const t = useT();
  const [account, setAccount] = useState<ClaudeAccount | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const load = useCallback(() => {
    api
      .get<ClaudeAccount>("/api/v1/runtimes/claude/account")
      .then((next) => {
        setAccount(next);
        setError(null);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  }, [api]);
  useEffect(() => load(), [load]);
  const job = account?.job ?? null;
  const signingIn = job?.kind === "login" && job.state === "running";
  useEffect(() => {
    if (!signingIn) return;
    const timer = setInterval(load, 1_500);
    return () => clearInterval(timer);
  }, [signingIn, load]);
  // The sign-in ended well: let the screen know (its next test should pass).
  const [seenDone, setSeenDone] = useState<string | null>(null);
  useEffect(() => {
    if (job?.state === "done" && job.finishedAt && job.finishedAt !== seenDone) {
      setSeenDone(job.finishedAt);
      onSignedIn?.();
    }
  }, [job, seenDone, onSignedIn]);

  const post = async (path: string, body: object = {}) => {
    setError(null);
    try {
      const result = await api.post<{ kind?: string; state?: string; error?: string | null }>(path, body);
      if (result?.state === "failed" && result.error) setError(result.error);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
    load();
  };
  const sendCode = async () => {
    await post("/api/v1/runtimes/claude/code", { code: code.trim() });
    setCode("");
  };

  if (!account) return error ? <p className="error small">{error}</p> : null;
  if (!account.installed) return null;
  return (
    <div className="claude-sign-in" data-testid="claude-sign-in">
      <p className="small">
        <strong>{t("claude.account")}:</strong> {account.loggedIn ? `✓ ${t("claude.signedIn", { method: account.method ?? "—" })}` : t("claude.notSignedIn")}
      </p>
      {expired && !signingIn && (
        <p className="error small" role="alert">
          {account.token.saved ? t("claude.tokenExpiredHint") : t("claude.expiredHint")}
        </p>
      )}
      {signingIn ? (
        <div className="chatgpt-login" data-testid="claude-login">
          <p className="small">{t("claude.browserHelp")}</p>
          {job.url && (
            <a className="btn btn-primary" href={job.url} target="_blank" rel="noreferrer">
              {t("claude.openPage")}
            </a>
          )}
          <label>
            {t("claude.codeLabel")}
            <input value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" spellCheck={false} name="claude-code-input" />
          </label>
          <div className="card-actions">
            <button type="button" className="btn btn-primary" disabled={!code.trim()} onClick={() => void sendCode()}>
              {t("claude.sendCode")}
            </button>
            <button type="button" className="btn" onClick={() => void post("/api/v1/runtimes/claude/cancel")}>
              {t("newbot.cancel")}
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className={`btn ${expired || !account.loggedIn ? "btn-primary" : ""}`} onClick={() => void post("/api/v1/runtimes/claude/login")}>
          {account.loggedIn ? t("claude.signInAgain") : t("claude.signIn")}
        </button>
      )}
      {job?.state === "done" && <p className="muted small">{t("claude.done")}</p>}
      {job?.state === "failed" && job.error && job.error !== "cancelled" && <p className="error small">{job.error}</p>}
      {error && !(job?.state === "failed" && job.error === error) && <p className="error small">{error}</p>}
      <ClaudeToken api={api} status={account.token} onChange={load} />
    </div>
  );
}
