// Claude Code's login, from the settings screen (specs/web-app, specs/agent-runtimes):
// the subscription brain runs on the login the `claude` program keeps, and that
// login expires. This shows whether it is signed in, signs in again (the browser
// opens on this computer; a page and the code it shows work from any device) and,
// when a test failed because the login expired, says so.
import { useCallback, useEffect, useState } from "react";
import type { ClaudeAccount } from "@orbis/shared";
import type { Api } from "../api.js";
import { useT } from "../i18n.js";

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
          {t("claude.expiredHint")}
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
    </div>
  );
}
