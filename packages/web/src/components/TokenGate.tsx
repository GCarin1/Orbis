import { useState } from "react";
import { Api } from "../api.js";
import { useT } from "../i18n.js";

export function TokenGate({ onToken }: { onToken(token: string): void }) {
  const t = useT();
  const [token, setToken] = useState("");
  const [error, setError] = useState(false);
  return (
    <main className="gate">
      <form
        className="dialog"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await new Api(token.trim()).get("/api/v1/bots");
            onToken(token.trim());
          } catch {
            setError(true);
          }
        }}
      >
        <img src="/icon.svg" alt="" width={48} height={48} />
        <h1>Orbis</h1>
        <p className="muted">{t("app.tagline")}</p>
        <h2>{t("token.title")}</h2>
        <p className="muted">{t("token.help")}</p>
        <input
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder={t("token.placeholder")}
          aria-label={t("token.placeholder")}
          autoFocus
        />
        {error && <p className="error">{t("token.invalid")}</p>}
        <button className="btn btn-primary" type="submit" disabled={!token.trim()}>
          {t("token.submit")}
        </button>
      </form>
    </main>
  );
}
