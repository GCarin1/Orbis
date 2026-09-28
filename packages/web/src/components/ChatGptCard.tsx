// ChatGPT as a brain, with no API key (specs/web-app, specs/agent-runtimes):
// the Codex CLI signs in with the user's ChatGPT account. This card installs
// it, signs in (the browser on this computer, or a code on any device), tests
// that a model answers, and signs out.
import { useCallback, useEffect, useState } from "react";
import type { BrainTestResult, CliJob, CodexAccount } from "@orbis/shared";
import type { Api } from "../api.js";
import { useT } from "../i18n.js";
import { TestResultView, type TestState } from "./brains.js";

export function ChatGptCard({ api }: { api: Api }) {
  const t = useT();
  const [account, setAccount] = useState<CodexAccount | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [test, setTest] = useState<TestState | undefined>(undefined);
  const load = useCallback(() => {
    api
      .get<CodexAccount>("/api/v1/runtimes/codex/account")
      .then((next) => {
        setAccount(next);
        setError(null);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  }, [api]);
  useEffect(() => load(), [load]);
  const running = account?.job?.state === "running";
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(load, 1_500);
    return () => clearInterval(timer);
  }, [running, load]);

  const start = async (path: string, body: object = {}) => {
    setError(null);
    try {
      const job = await api.post<CliJob | CodexAccount>(path, body);
      if ("kind" in job && job.state === "failed") setError(job.error);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
    load();
  };
  const runTest = async () => {
    setTest({ pending: true });
    try {
      setTest({ pending: false, result: await api.post<BrainTestResult>("/api/v1/runtimes/test", { brain: { kind: "codex" } }) });
    } catch (err) {
      setTest({
        pending: false,
        result: { kind: "codex", ok: false, reply: "", error: err instanceof Error ? err.message : String(err), durationMs: 0, answered: false },
      });
    }
  };

  const job = account?.job ?? null;
  const signingIn = job?.kind === "login" && job.state === "running";
  return (
    <article className="brain-card chatgpt-card" data-testid="chatgpt-card">
      <header>
        <strong>
          <span aria-hidden="true">💬</span> {t("chatgpt.title")}
        </strong>
        {account && (
          <span className={`badge ${account.loggedIn && account.method === "chatgpt" ? "ok" : "off"}`}>
            {account.loggedIn && account.method === "chatgpt"
              ? `✓ ${t("chatgpt.connected")}`
              : account.loggedIn
                ? t("chatgpt.apiKey")
                : account.installed
                  ? t("chatgpt.notSignedIn")
                  : t("chatgpt.notInstalled")}
          </span>
        )}
      </header>
      <p className="small">{t("chatgpt.help")}</p>
      {!account && !error && <p className="muted small">…</p>}
      {account && (
        <ol className="chatgpt-steps">
          <li className={account.installed ? "done" : ""}>
            <strong>{t("chatgpt.step.install")}</strong>{" "}
            {account.installed ? (
              <span className="muted small">
                ✓ {account.version} · <code>{account.path}</code>
              </span>
            ) : (
              <button type="button" className="btn" disabled={running} onClick={() => void start("/api/v1/runtimes/codex/install")}>
                {job?.kind === "install" && running ? t("chatgpt.installing") : t("chatgpt.install")}
              </button>
            )}
          </li>
          <li className={account.loggedIn ? "done" : ""}>
            <strong>{t("chatgpt.step.signIn")}</strong>{" "}
            {account.loggedIn ? (
              <>
                <span className="muted small">✓ {account.detail}</span>{" "}
                <button type="button" className="link" onClick={() => void start("/api/v1/runtimes/codex/logout")}>
                  {t("chatgpt.signOut")}
                </button>
              </>
            ) : signingIn ? (
              <div className="chatgpt-login" data-testid="chatgpt-login">
                {job.code ? (
                  <>
                    <p className="small">{t("chatgpt.deviceHelp")}</p>
                    <p className="chatgpt-code" aria-label={t("chatgpt.codeLabel")}>
                      {job.code}
                    </p>
                  </>
                ) : (
                  <p className="small">{t("chatgpt.browserHelp")}</p>
                )}
                {job.url && (
                  <a className="btn btn-primary" href={job.url} target="_blank" rel="noreferrer">
                    {t("chatgpt.openPage")}
                  </a>
                )}{" "}
                <button type="button" className="btn" onClick={() => void start("/api/v1/runtimes/codex/cancel")}>
                  {t("newbot.cancel")}
                </button>
              </div>
            ) : (
              <span className="card-actions inline">
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!account.installed || running}
                  onClick={() => void start("/api/v1/runtimes/codex/login", { device: false })}
                >
                  {t("chatgpt.signInBrowser")}
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={!account.installed || running}
                  onClick={() => void start("/api/v1/runtimes/codex/login", { device: true })}
                >
                  {t("chatgpt.signInCode")}
                </button>
              </span>
            )}
          </li>
          <li>
            <strong>{t("chatgpt.step.use")}</strong> <span className="muted small">{t("chatgpt.useHelp")}</span>{" "}
            <button type="button" className="btn" disabled={!account.loggedIn || test?.pending === true} onClick={() => void runTest()}>
              {t("brains.test")}
            </button>
            <TestResultView state={test} />
          </li>
        </ol>
      )}
      {job?.state === "failed" && job.error && job.error !== "cancelled" && <p className="error small">{job.error}</p>}
      {job?.kind === "install" && running && job.log && <pre className="build-log">{job.log}</pre>}
      {error && <p className="error small">{error}</p>}
    </article>
  );
}
