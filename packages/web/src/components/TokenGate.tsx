// The sign-in screen: the API token, or a pairing code from the computer (Settings → Phone), which the
// phone's camera also brings in a QR code's link (#pair=…).
import { useEffect, useRef, useState } from "react";
import { Api, claimPairing } from "../api.js";
import { useT } from "../i18n.js";
import { Mascot } from "./Avatar.js";

/** Six digits, with or without the space the computer shows ("483 219"): a pairing code, not a token. */
export const pairingDigits = (text: string) => {
  const digits = text.replace(/[\s-]/g, "");
  return /^\d{6}$/.test(digits) ? digits : null;
};

export function TokenGate({ onToken, pairCode = null }: { onToken(token: string): void; pairCode?: string | null }) {
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
