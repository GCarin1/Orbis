// The Orbis desktop app (specs/desktop-app, ADR 0007): finds or starts the hub,
// shows the web app in a hardened window, raises native notifications and
// stays in the tray.
import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, Notification, shell, Tray } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Bot } from "@orbis/shared";
import { ensureHub, type LaunchedHub } from "./hub-launcher.js";
import { botDirectory, NotificationCenter } from "./notifications.js";
import { loadSettings, saveSettings } from "./settings.js";
import { followStream } from "./stream.js";
import { allowPermission, guardWebContents, isAllowedNavigation, windowOptions } from "./window.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const assets = path.join(here, "..", "assets");
const settingsFile = () => path.join(app.getPath("userData"), "settings.json");

let window: BrowserWindow | null = null;
let tray: Tray | null = null;
let hub: LaunchedHub | null = null;
let stopStream: (() => void) | null = null;
let quitting = false;

function showWindow(conversationId?: string | null): void {
  if (!window) return;
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
  if (conversationId) window.webContents.send("orbis:open-conversation", conversationId);
}

function createWindow(launched: LaunchedHub): BrowserWindow {
  const win = new BrowserWindow(windowOptions(path.join(here, "preload.cjs"), path.join(assets, "icon.png")));
  guardWebContents(win.webContents, launched.url, (url) => void shell.openExternal(url));
  win.webContents.session.setPermissionRequestHandler((contents, permission, allow, details) => {
    allow(allowPermission(permission, details as { mediaTypes?: string[] }, contents.getURL(), launched.url));
  });
  win.once("ready-to-show", () => win.show());
  // Closing the window keeps Orbis in the tray; bots keep working.
  win.on("close", (event) => {
    if (quitting) return;
    event.preventDefault();
    win.hide();
  });
  // The token travels in the fragment: the web app stores it and clears the address.
  void win.loadURL(launched.token ? `${launched.url}/#token=${encodeURIComponent(launched.token)}` : launched.url);
  return win;
}

function createTray(): Tray {
  const icon = nativeImage.createFromPath(path.join(assets, "tray.png"));
  const t = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
  t.setToolTip("Orbis");
  t.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Open Orbis", click: () => showWindow() },
      { label: "Settings file…", click: () => void shell.openPath(settingsFile()) },
      { type: "separator" },
      {
        label: "Quit Orbis",
        click: () => {
          quitting = true;
          app.quit();
        },
      },
    ]),
  );
  t.on("click", () => showWindow());
  return t;
}

async function followNotifications(launched: LaunchedHub): Promise<void> {
  const bots = botDirectory();
  try {
    const res = await fetch(`${launched.url}/api/v1/bots?includeHidden=true`, { headers: launched.token ? { authorization: `Bearer ${launched.token}` } : {} });
    if (res.ok) bots.set((await res.json()) as Bot[]);
  } catch {
    /* names fill in from the stream */
  }
  const center = new NotificationCenter((id) => bots.name(id));
  stopStream = followStream(launched.url, launched.token, (event) => {
    bots.apply(event);
    const note = center.fromEvent(event);
    if (!note || !Notification.isSupported()) return;
    const native = new Notification({ title: note.title, body: note.body, silent: false });
    native.on("click", () => showWindow(note.conversationId));
    native.show();
  });
}

function registerIpc(): void {
  ipcMain.handle("orbis:settings:get", () => loadSettings(settingsFile()));
  ipcMain.handle("orbis:settings:set-hub-url", (_event, hubUrl: string) => {
    saveSettings(settingsFile(), { hubUrl });
    app.relaunch();
    quitting = true;
    app.quit();
  });
  ipcMain.on("orbis:notify", (_event, title: string, body: string) => {
    if (Notification.isSupported()) new Notification({ title, body }).show();
  });
}

async function start(): Promise<void> {
  const settings = loadSettings(settingsFile());
  try {
    hub = await ensureHub({ url: settings.hubUrl });
  } catch (err) {
    dialog.showErrorBox("Orbis could not reach its hub", `${err instanceof Error ? err.message : String(err)}\n\nSettings: ${settingsFile()}`);
    quitting = true;
    app.quit();
    return;
  }
  registerIpc();
  window = createWindow(hub);
  tray = createTray();
  void followNotifications(hub);
}

// One app at a time: a second launch focuses the first.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => showWindow());
  app.setAppUserModelId("dev.orbis.desktop");
  app.whenReady().then(start, (err: unknown) => console.error(err));
  app.on("activate", () => showWindow());
  app.on("before-quit", () => {
    quitting = true;
    stopStream?.();
    tray?.destroy();
    // Stop the hub only if this app started it.
    hub?.child?.kill("SIGTERM");
  });
  // Stay alive in the tray when every window is closed.
  app.on("window-all-closed", () => undefined);
}
