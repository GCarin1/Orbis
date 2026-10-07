// The user's health data from the phone (specs/web-app, specs/health, change 0062-health-connect): inside the
// Android app, the page asks the app to read Health Connect and sends what it read to the hub — when the user
// presses Sync, and on its own when they chose so: when the app opens, and every 30 minutes while it is open.
import type { HealthStatus } from "@orbis/shared";
import type { Api } from "./api.js";
import { androidCan, healthRead } from "./native.js";

const AUTO_KEY = "orbis.health.auto";
/** How often the open app syncs on its own. */
export const HEALTH_SYNC_MS = 30 * 60 * 1000;

/** Whether this device syncs on its own (a choice of the device, not of the hub). */
export function healthAuto(): boolean {
  try {
    return globalThis.localStorage?.getItem(AUTO_KEY) === "1";
  } catch {
    return false;
  }
}

export function setHealthAuto(on: boolean): void {
  try {
    if (on) globalThis.localStorage?.setItem(AUTO_KEY, "1");
    else globalThis.localStorage?.removeItem(AUTO_KEY);
  } catch {
    /* no storage */
  }
}

/** Whether this page runs in an Android app that reads Health Connect. */
export const canReadHealth = () => androidCan("healthRead") && androidCan("healthStatus");

/** Read the last `days` days on the phone and send them to the hub; resolves with the hub's new status. */
export async function syncHealth(api: Api, days = 30): Promise<HealthStatus> {
  const read = await healthRead(days);
  if (read.error) throw new Error(read.error);
  return api.put<HealthStatus>("/api/v1/health/sync", { days: read.days ?? [], sessions: read.sessions ?? [], sources: read.sources ?? [] });
}

/** Sync now and every 30 minutes while the page is shown, when the device chose so; returns the stop. */
export function startHealthSync(api: Api, every = HEALTH_SYNC_MS): () => void {
  if (!canReadHealth()) return () => undefined;
  let last = 0;
  const sync = () => {
    if (!healthAuto() || document.visibilityState === "hidden") return;
    // Back on screen often: at most once every 10 minutes.
    if (Date.now() - last < 10 * 60 * 1000) return;
    if (androidCanStatus() !== "available") return;
    last = Date.now();
    void syncHealth(api).catch(() => undefined);
  };
  sync();
  const timer = setInterval(sync, every);
  const onShow = () => document.visibilityState === "visible" && sync();
  document.addEventListener("visibilitychange", onShow);
  return () => {
    clearInterval(timer);
    document.removeEventListener("visibilitychange", onShow);
  };
}

function androidCanStatus(): string {
  try {
    return (window as unknown as { orbisAndroid?: { healthStatus?(): string } }).orbisAndroid?.healthStatus?.() ?? "unavailable";
  } catch {
    return "unavailable";
  }
}
