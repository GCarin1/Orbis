// The hardened window (specs/desktop-app, ADR 0007): the renderer is isolated,
// sandboxed and without Node, and it never leaves the hub's origin.
import type { BrowserWindowConstructorOptions, WebContents } from "electron";

export function windowOptions(preload: string, icon?: string): BrowserWindowConstructorOptions {
  return {
    width: 1280,
    height: 820,
    minWidth: 720,
    minHeight: 480,
    title: "Orbis",
    backgroundColor: "#0b1020",
    show: false,
    ...(icon ? { icon } : {}),
    webPreferences: {
      preload,
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      spellcheck: true,
    },
  };
}

/** Only the hub's own origin may load in the window. */
export function isAllowedNavigation(target: string, hubUrl: string): boolean {
  try {
    return new URL(target).origin === new URL(hubUrl).origin;
  } catch {
    return false;
  }
}

/**
 * What the hub's page may ask for: notifications, and the microphone alone
 * for voice input (never the camera or the screen). Other pages get nothing.
 */
export function allowPermission(permission: string, details: { mediaTypes?: string[] }, pageUrl: string, hubUrl: string): boolean {
  if (!isAllowedNavigation(pageUrl, hubUrl)) return false;
  if (permission === "notifications") return true;
  if (permission === "media") {
    const types = details.mediaTypes ?? [];
    return types.length > 0 && types.every((type) => type === "audio");
  }
  return false;
}

/** Links to other web sites open in the system browser; anything else is refused. */
export function externalTarget(target: string): string | null {
  try {
    const url = new URL(target);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

/** Keep the window on the hub: block navigation away and route new windows outside. */
export function guardWebContents(contents: Pick<WebContents, "on" | "setWindowOpenHandler">, hubUrl: string, openExternal: (url: string) => void): void {
  contents.on("will-navigate", (event, target) => {
    if (isAllowedNavigation(target, hubUrl)) return;
    event.preventDefault();
    const external = externalTarget(target);
    if (external) openExternal(external);
  });
  contents.on("will-redirect", (event, target) => {
    if (!isAllowedNavigation(target, hubUrl)) event.preventDefault();
  });
  contents.setWindowOpenHandler(({ url }) => {
    const external = externalTarget(url);
    if (external && !isAllowedNavigation(url, hubUrl)) openExternal(external);
    return { action: "deny" };
  });
}
