// Settings → Account (specs/web-app, change 0064-account-sign-in): the Orbis account linked to this hub. Signed
// in with the hub's token, the user signs in to their account (or creates it) and links it; from then on any
// device opens the hub with that email and password. Unlinking stops every account session at once.
import { useEffect, useState } from "react";
import type { AccountStatus, AuthConfig } from "@orbis/shared";
import type { Api } from "../api.js";
import { AccountError, MIN_PASSWORD, signIn, signUp, type AccountSession, type Session } from "../account.js";
import { useLang, useT } from "../i18n.js";

export function AccountSettings({ api, account, onSignedOut }: { api: Api; account: AccountSession | null; onSignedOut(): void }) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const [status, setStatus] = useState<AccountStatus | null>(null);
  const [project, setProject] = useState<AuthConfig["supabase"]>(null);
  const [mode, setMode] = useState<"signIn" | "signUp">("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [signedIn, setSignedIn] = useState<Session | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    void Promise.all([api.get<AccountStatus>("/api/v1/account"), api.get<AuthConfig>("/api/v1/auth/config")])
      .then(([s, c]) => {
        setStatus(s);
        setProject(c.supabase);
      })
      .catch((err) => setMessage({ ok: false, text: err instanceof Error ? err.message : String(err) }));
  }, [api]);

  const act = async (fn: () => Promise<string | void>) => {
    setBusy(true);
    setMessage(null);
    try {
      const done = await fn();
      if (done) setMessage({ ok: true, text: done });
    } catch (err) {
      const code = err instanceof AccountError ? err.code : null;
      const text =
        code === "invalid_credentials" || code === "invalid_grant"
          ? t("account.wrongPassword")
          : code === "email_not_confirmed"
            ? t("account.notConfirmed")
            : code === "weak_password"
              ? t("account.weakPassword", { min: MIN_PASSWORD })
              : err instanceof Error
                ? err.message
                : String(err);
      setMessage({ ok: false, text });
    } finally {
      setBusy(false);
    }
  };

  const submit = () =>
    act(async () => {
      if (!project) return;
      if (mode === "signUp") {
        if (password !== again) throw new Error(t("account.mismatch"));
        const session = await signUp(project, email, password, window.location.origin + window.location.pathname);
        if (!session) return t("account.confirmSent", { email: email.trim() });
        setSignedIn(session);
        return;
      }
      setSignedIn(await signIn(project, email, password));
    });
  const link = () =>
    act(async () => {
      setStatus(await api.post<AccountStatus>("/api/v1/account/link", { accessToken: signedIn!.accessToken }));
      setSignedIn(null);
      setPassword("");
      setAgain("");
      return t("account.linkedNow");
    });
  const unlink = () => {
    if (!window.confirm(t("account.confirmUnlink"))) return;
    void act(async () => {
      setStatus(await api.delete<AccountStatus>("/api/v1/account"));
      // Signed in by the account, this device has no way in any more.
      if (account) onSignedOut();
      return t("account.unlinked");
    });
  };
  const signOut = () =>
    act(async () => {
      await account?.signOut();
      onSignedOut();
    });

  const viaToken = status?.via === "token";
  return (
    <div className="account-settings" data-testid="account-settings">
      <h2>{t("account.title")}</h2>
      <p className="muted">{t("account.intro")}</p>

      <section className="health-card" data-testid="account-status">
        {!status ? (
          <p className="muted">{t("timeline.loading")}</p>
        ) : !status.available ? (
          <p className="muted">{t("account.off")}</p>
        ) : status.linked ? (
          <>
            <p>{t("account.linkedTo", { email: status.linked.email ?? status.linked.userId })}</p>
            <p className="muted small">
              {t("account.linkedSince", { when: new Date(status.linked.linkedAt).toLocaleString(lang, { dateStyle: "short", timeStyle: "short" }) })} ·{" "}
              {status.via === "account" ? t("account.viaAccount") : t("account.viaToken")}
            </p>
            <div className="card-actions">
              {account && (
                <button type="button" className="btn" disabled={busy} onClick={() => void signOut()}>
                  {t("account.signOut")}
                </button>
              )}
              <button type="button" className="btn btn-danger" disabled={busy} onClick={unlink}>
                {t("account.unlink")}
              </button>
            </div>
          </>
        ) : (
          <p className="muted">{t("account.notLinked")}</p>
        )}
      </section>

      {status?.available && viaToken && project && (
        <section className="health-card" data-testid="account-link">
          <h3>{status.linked ? t("account.linkOther") : t("account.linkTitle")}</h3>
          {signedIn ? (
            <>
              <p>{t("account.signedInAs", { email: signedIn.user.email ?? signedIn.user.id })}</p>
              <div className="card-actions">
                <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void link()}>
                  {t("account.link")}
                </button>
                <button type="button" className="btn" disabled={busy} onClick={() => setSignedIn(null)}>
                  {t("account.cancel")}
                </button>
              </div>
            </>
          ) : (
            <form
              className="account-form"
              onSubmit={(e) => {
                e.preventDefault();
                void submit();
              }}
            >
              <div className="segmented" role="tablist">
                <button type="button" role="tab" aria-selected={mode === "signIn"} className={mode === "signIn" ? "on" : ""} onClick={() => setMode("signIn")}>
                  {t("account.haveAccount")}
                </button>
                <button type="button" role="tab" aria-selected={mode === "signUp"} className={mode === "signUp" ? "on" : ""} onClick={() => setMode("signUp")}>
                  {t("account.createAccount")}
                </button>
              </div>
              <label>
                {t("account.email")}
                <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </label>
              <label>
                {t("account.password")}
                <input
                  type="password"
                  autoComplete={mode === "signUp" ? "new-password" : "current-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
              {mode === "signUp" && (
                <>
                  <label>
                    {t("account.passwordAgain")}
                    <input type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} />
                  </label>
                  <p className="muted small">{t("account.passwordRule", { min: MIN_PASSWORD })}</p>
                </>
              )}
              <button
                className="btn btn-primary"
                type="submit"
                disabled={busy || !email.trim() || !password || (mode === "signUp" && password.length < MIN_PASSWORD)}
              >
                {mode === "signUp" ? t("account.createAccount") : t("account.signIn")}
              </button>
            </form>
          )}
        </section>
      )}

      {message && (
        <p className={message.ok ? "muted" : "error"} role="status">
          {message.text}
        </p>
      )}
    </div>
  );
}
