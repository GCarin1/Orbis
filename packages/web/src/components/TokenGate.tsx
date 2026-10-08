// The sign-in screen: the Orbis account linked to this hub (an email and a password, change 0064), the API
// token, or a pairing code from the computer (Settings → Phone), which the phone's camera also brings in a
// QR code's link (#pair=…). An email's reset link lands here to choose a new password.
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { AuthConfig } from "@orbis/shared";
import { Api, claimPairing } from "../api.js";
import { AccountError, MIN_PASSWORD, recover, signIn, updatePassword, type Session } from "../account.js";
import { useT } from "../i18n.js";
import { Mascot } from "./Avatar.js";

/** Six digits, with or without the space the computer shows ("483 219"): a pairing code, not a token. */
export const pairingDigits = (text: string) => {
  const digits = text.replace(/[\s-]/g, "");
  return /^\d{6}$/.test(digits) ? digits : null;
};

function GateFrame({ title, children, onSubmit }: { title: string; children: ReactNode; onSubmit(): void | Promise<void> }) {
  const t = useT();
  return (
    <main className="gate">
      <form
        className="dialog"
        onSubmit={(e) => {
          e.preventDefault();
          void onSubmit();
        }}
      >
        <div className="gate-brand">
          <Mascot size={96} />
          <h1 className="wordmark">Orbis</h1>
          <p className="brand-tagline">{t("brand.tagline")}</p>
          <p className="muted">{t("app.tagline")}</p>
        </div>
        <h2>{title}</h2>
        {children}
      </form>
    </main>
  );
}

/** Supabase's words for a refusal, in the user's language when Orbis knows them. */
function useAccountError() {
  const t = useT();
  return (err: unknown) => {
    const code = err instanceof AccountError ? err.code : null;
    if (code === "invalid_credentials" || code === "invalid_grant") return t("account.wrongPassword");
    if (code === "email_not_confirmed") return t("account.notConfirmed");
    if (code === "weak_password") return t("account.weakPassword", { min: MIN_PASSWORD });
    if (code === "network") return t("account.unreachable");
    if (code === "over_request_rate_limit" || code === "over_email_send_rate_limit") return t("account.tooMany");
    return err instanceof Error ? err.message : String(err);
  };
}

/** Choose a new password, signed in by the email's reset link. */
function NewPassword({ project, session, onDone }: { project: NonNullable<AuthConfig["supabase"]>; session: Session; onDone(session: Session): void }) {
  const t = useT();
  const explain = useAccountError();
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <GateFrame
      title={t("account.newPassword")}
      onSubmit={async () => {
        if (password !== again) return setError(t("account.mismatch"));
        setBusy(true);
        setError(null);
        try {
          await updatePassword(project, session, password);
          onDone(session);
        } catch (err) {
          setError(explain(err));
        } finally {
          setBusy(false);
        }
      }}
    >
      <p className="muted">{t("account.newPasswordHelp", { email: session.user.email ?? "", min: MIN_PASSWORD })}</p>
      <label>
        {t("account.password")}
        <input type="password" autoComplete="new-password" value={password} minLength={MIN_PASSWORD} onChange={(e) => setPassword(e.target.value)} autoFocus />
      </label>
      <label>
        {t("account.passwordAgain")}
        <input type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} />
      </label>
      {error && <p className="error">{error}</p>}
      <button className="btn btn-primary" type="submit" disabled={busy || password.length < MIN_PASSWORD}>
        {t("account.savePassword")}
      </button>
    </GateFrame>
  );
}

/** Sign in with the account linked to this hub, or have a reset link emailed. */
function AccountSignIn({ project, onSession, onUseToken, linkError }: { project: NonNullable<AuthConfig["supabase"]>; onSession(session: Session): void; onUseToken(): void; linkError: string | null }) {
  const t = useT();
  const explain = useAccountError();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [forgot, setForgot] = useState(false);
  const [error, setError] = useState<string | null>(linkError);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(explain(err));
    } finally {
      setBusy(false);
    }
  };
  if (forgot) {
    return (
      <GateFrame title={t("account.forgotTitle")} onSubmit={() => run(async () => {
        await recover(project, email, window.location.origin + window.location.pathname);
        setSent(true);
      })}>
        <p className="muted">{t("account.forgotHelp")}</p>
        <label>
          {t("account.email")}
          <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
        </label>
        {sent && <p role="status" className="muted">{t("account.resetSent", { email })}</p>}
        {error && <p className="error">{error}</p>}
        <button className="btn btn-primary" type="submit" disabled={busy || !email.trim()}>
          {t("account.sendReset")}
        </button>
        <button className="btn" type="button" onClick={() => setForgot(false)}>
          {t("account.backToSignIn")}
        </button>
      </GateFrame>
    );
  }
  return (
    <GateFrame title={t("account.signInTitle")} onSubmit={() => run(async () => onSession(await signIn(project, email, password)))}>
      <p className="muted">{t("account.signInHelp")}</p>
      <label>
        {t("account.email")}
        <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
      </label>
      <label>
        {t("account.password")}
        <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </label>
      {error && <p className="error">{error}</p>}
      <button className="btn btn-primary" type="submit" disabled={busy || !email.trim() || !password}>
        {t("account.signIn")}
      </button>
      <div className="card-actions">
        <button className="btn" type="button" onClick={() => setForgot(true)}>
          {t("account.forgot")}
        </button>
        <button className="btn" type="button" onClick={onUseToken}>
          {t("account.useToken")}
        </button>
      </div>
    </GateFrame>
  );
}

export function TokenGate({
  onToken,
  pairCode = null,
  auth = null,
  newPassword = null,
  linkError = null,
  onSession = () => undefined,
}: {
  onToken(token: string): void;
  pairCode?: string | null;
  /** Where accounts sign in, and whether one opens this hub. */
  auth?: AuthConfig | null;
  /** The session an email's reset link brought: choose a new password first. */
  newPassword?: Session | null;
  /** What an email's link ended with, when it failed (an expired link). */
  linkError?: string | null;
  onSession?(session: Session): void;
}) {
  const [useToken, setUseToken] = useState(pairCode !== null);
  if (auth?.supabase && newPassword) return <NewPassword project={auth.supabase} session={newPassword} onDone={onSession} />;
  if (auth?.supabase && auth.linked && !useToken) {
    return <AccountSignIn project={auth.supabase} onSession={onSession} onUseToken={() => setUseToken(true)} linkError={linkError} />;
  }
  return <TokenSignIn onToken={onToken} pairCode={pairCode} />;
}

function TokenSignIn({ onToken, pairCode = null }: { onToken(token: string): void; pairCode?: string | null }) {
  const t = useT();
  const [token, setToken] = useState("");
  const [error, setError] = useState<"token" | "code" | null>(null);
  const [pairing, setPairing] = useState(pairCode !== null);
  const claimed = useRef(false);

  const pair = async (code: string) => {
    setPairing(true);
    setError(null);
    try {
      onToken(await claimPairing(code));
    } catch {
      setError("code");
      setPairing(false);
    }
  };

  // A QR code's link: trade its code once, as soon as the page opens.
  useEffect(() => {
    if (!pairCode || claimed.current) return;
    claimed.current = true;
    void pair(pairCode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pairCode]);

  return (
    <main className="gate">
      <form
        className="dialog"
        onSubmit={async (e) => {
          e.preventDefault();
          const code = pairingDigits(token);
          if (code) return pair(code);
          try {
            await new Api(token.trim()).get("/api/v1/bots");
            onToken(token.trim());
          } catch {
            setError("token");
          }
        }}
      >
        <div className="gate-brand">
          <Mascot size={96} />
          <h1 className="wordmark">Orbis</h1>
          <p className="brand-tagline">{t("brand.tagline")}</p>
          <p className="muted">{t("app.tagline")}</p>
        </div>
        <h2>{t("token.title")}</h2>
        {pairing ? (
          <p role="status" className="muted">
            {t("token.pairing")}
          </p>
        ) : (
          <>
            <p className="muted">{t("token.help")}</p>
            <p className="muted small">{t("token.orCode")}</p>
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder={t("token.placeholder")}
              aria-label={t("token.placeholder")}
              autoFocus
            />
            {error === "token" && <p className="error">{t("token.invalid")}</p>}
            {error === "code" && <p className="error">{t("token.codeInvalid")}</p>}
            <button className="btn btn-primary" type="submit" disabled={!token.trim()}>
              {t("token.submit")}
            </button>
          </>
        )}
      </form>
    </main>
  );
}
