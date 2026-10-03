// Settings → Phone (specs/android-app, specs/web-app): on the computer, a QR code and a code that pair the
// phone with this hub without typing the token; inside the Android app, the hub it shows, its notifications
// and keeping it connected in the background.
import { useEffect, useState } from "react";
import type { PairingCode } from "@orbis/shared";
import type { Api } from "../api.js";
import { useT } from "../i18n.js";
import { androidApp } from "../native.js";
import { QrCode } from "./QrCode.js";

/** "483219" → "483 219", easier to read aloud and to type. */
export const spacedCode = (code: string) => `${code.slice(0, 3)} ${code.slice(3)}`;

/** The link a QR code holds: the hub's address and the code, which the app or the phone's browser trades for the token. */
export const pairingLink = (address: string, code: string) => `${address.replace(/\/?$/, "/")}#pair=${code}`;

/**
 * The addresses a phone can reach this hub at: the one this page was opened at when it is not this computer's
 * own (a network address or a domain), then the hub's network cards.
 */
export function phoneAddresses(addresses: string[], here: { origin: string; hostname: string }): string[] {
  const local = /^(localhost|127\.\d+\.\d+\.\d+|\[::1\])$/i.test(here.hostname);
  const all = local ? addresses : [`${here.origin}/`, ...addresses];
  return [...new Set(all)];
}

function PairingCard({ api }: { api: Api }) {
  const t = useT();
  const [pairing, setPairing] = useState<PairingCode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [chosen, setChosen] = useState(0);
  const left = pairing ? Math.max(0, Math.round((new Date(pairing.expiresAt).getTime() - now) / 1000)) : 0;
  const addresses = pairing ? phoneAddresses(pairing.addresses, window.location) : [];
  const address = addresses[Math.min(chosen, addresses.length - 1)];

  useEffect(() => {
    if (!pairing) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [pairing]);

  const make = async () => {
    setError(null);
    try {
      setPairing(await api.post<PairingCode>("/api/v1/pairing"));
      setNow(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="phone-card" data-testid="pairing-card">
      <h2>{t("phone.pairTitle")}</h2>
      <ol className="muted phone-steps">
        <li>{t("phone.pairStep1")}</li>
        <li>{t("phone.pairStep2")}</li>
        <li>{t("phone.pairStep3")}</li>
      </ol>
      {pairing && !pairing.listening && (
        <p className="notice" role="status">
          {t("phone.notListening")}
        </p>
      )}
      {pairing && left > 0 ? (
        <div className="pairing-code">
          {address && (
            <figure className="pairing-qr" data-testid="pairing-qr" data-link={pairingLink(address, pairing.code)}>
              <QrCode text={pairingLink(address, pairing.code)} label={t("phone.qrLabel", { address })} />
              <figcaption className="muted small">{t("phone.qrHelp")}</figcaption>
            </figure>
          )}
          <span className="code" aria-label={t("phone.code")} data-testid="pairing-code">
            {spacedCode(pairing.code)}
          </span>
          <span className="muted">{t("phone.codeLeft", { time: `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}` })}</span>
          {addresses.length > 0 && (
            <div>
              <p className="field-label">{t("phone.addresses")}</p>
              {/* More than one network card: the QR code holds the address picked here. */}
              <ul className="phone-addresses" role={addresses.length > 1 ? "radiogroup" : undefined} aria-label={t("phone.addresses")}>
                {addresses.map((a, i) => (
                  <li key={a}>
                    {addresses.length > 1 ? (
                      <label className="check">
                        <input type="radio" name="pairing-address" checked={a === address} onChange={() => setChosen(i)} /> <code>{a}</code>
                      </label>
                    ) : (
                      <code>{a}</code>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : (
        <button type="button" className="btn btn-primary" onClick={() => void make()}>
          {pairing ? t("phone.newCode") : t("phone.makeCode")}
        </button>
      )}
      {error && <p className="error">{error}</p>}
      <p className="muted small">{t("phone.getApp")}</p>
      <p className="muted small">{t("phone.anywhere")}</p>
    </div>
  );
}

function AndroidCard() {
  const t = useT();
  const android = androidApp()!;
  const [allowed, setAllowed] = useState(() => android.notificationsAllowed?.() ?? false);
  const [keep, setKeep] = useState(() => android.keepConnected?.() ?? false);
  // Back from Android's permission dialog or battery settings: read the state again.
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      setAllowed(android.notificationsAllowed?.() ?? false);
      setKeep(android.keepConnected?.() ?? false);
    };
    document.addEventListener("visibilitychange", refresh);
    return () => document.removeEventListener("visibilitychange", refresh);
  }, [android]);

  return (
    <div className="phone-card android-card" data-testid="android-card">
      <h2>{t("android.title")}</h2>
      <p className="muted">
        {t("android.connected", { url: android.hubUrl() })} · {t("android.version", { version: android.version() })}
      </p>
      <button type="button" className="btn" onClick={() => android.changeHub()}>
        {t("android.changeHub")}
      </button>
      {android.notify ? (
        <>
          <h3>{t("phone.notifications")}</h3>
          <p className="muted">{t("phone.notificationsHelp")}</p>
          {allowed ? (
            <p>
              <span className="badge ok">✓ {t("phone.notificationsOn")}</span>
            </p>
          ) : (
            <button type="button" className="btn btn-primary" onClick={() => android.requestNotifications?.()}>
              {t("phone.allowNotifications")}
            </button>
          )}
          {android.setKeepConnected && (
            <>
              <label className="check">
                <input
                  type="checkbox"
                  checked={keep}
                  onChange={(e) => {
                    android.setKeepConnected!(e.target.checked);
                    setKeep(e.target.checked);
                  }}
                  name="keep-connected"
                />{" "}
                {t("phone.keepConnected")}
              </label>
              <p className="muted small">{t("phone.keepConnectedHelp")}</p>
              {android.openBatterySettings && (
                <button type="button" className="btn" onClick={() => android.openBatterySettings!()}>
                  {t("phone.battery")}
                </button>
              )}
            </>
          )}
        </>
      ) : (
        <p className="muted small">{t("phone.updateApp")}</p>
      )}
    </div>
  );
}

export function PhoneSettings({ api }: { api: Api }) {
  return <div className="settings-section phone-settings">{androidApp() ? <AndroidCard /> : <PairingCard api={api} />}</div>;
}
