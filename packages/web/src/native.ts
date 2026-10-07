// What the Android app around the web app offers it (specs/android-app): saving a file to the phone's
// Downloads, the hub's address and changing it, notifications, the phone's dictation and voice. In a browser
// none of it exists and the web app does without. The web app comes from the hub and may be newer than the
// installed app: every function past the first ones is optional and checked before use.

export interface AndroidApp {
  saveText(name: string, mime: string, text: string): void;
  /** Save any file (an image, a PDF) to Downloads, its bytes in base64. */
  saveFile?(name: string, mime: string, base64: string): void;
  changeHub(): void;
  hubUrl(): string;
  version(): string;
  /** A notification; `tag` replaces the last one with that tag (one per conversation). */
  notify?(tag: string, title: string, body: string, conversationId: string): void;
  notificationsAllowed?(): boolean;
  requestNotifications?(): void;
  /** Keep the app running in the background (a lasting notification) so notifications keep coming. */
  keepConnected?(): boolean;
  setKeepConnected?(on: boolean): void;
  openBatterySettings?(): void;
  /** The phone's speech recognition; the words come back through `window.__orbisDictation`. */
  dictate?(lang: string): void;
  speak?(text: string, lang: string): void;
  stopSpeaking?(): void;
  /** Start the hub on this phone again (inside Termux); the app does nothing when the hub is elsewhere. */
  ensureLocalHub?(): void;
  /** Health Connect on this phone: "available", "update" (install or update it) or "unavailable". */
  healthStatus?(): string;
  /** The kinds of health data the user allowed; the answer comes to `window.__orbisHealth`. */
  healthCheck?(): void;
  /** Health Connect's screen to allow reading; the answer comes to `window.__orbisHealth`. */
  healthRequest?(): void;
  /** Read the last days; the data comes to `window.__orbisHealthData`. */
  healthRead?(days: number): void;
  /** Health Connect's settings, or its Play Store page to install or update it. */
  openHealthConnect?(): void;
}

/** What the app says the user allowed, or why it could not tell. */
export interface HealthGrant {
  granted?: string[];
  status?: string;
  error?: string;
}

/** What the app read from Health Connect, ready for `PUT /api/v1/health/sync`; or why it could not. */
export interface HealthRead {
  days?: Array<{ date: string; metrics: Record<string, number> }>;
  sessions?: Array<{ id: string; start: string; end: string; type: string; title: string | null; source: string | null }>;
  sources?: string[];
  granted?: string[];
  error?: string;
}

type HealthHooks = { __orbisHealth?: (answer: HealthGrant) => void; __orbisHealthData?: (answer: HealthRead) => void };

/** Ask the app something about Health Connect and wait for its answer (it comes back through a window hook). */
function healthAnswer<K extends keyof HealthHooks>(hook: K, ask: () => void, ms = 60_000): Promise<Parameters<NonNullable<HealthHooks[K]>>[0]> {
  return new Promise((resolve, reject) => {
    const hooks = window as unknown as HealthHooks;
    const timer = setTimeout(() => {
      delete hooks[hook];
      reject(new Error("the app did not answer"));
    }, ms);
    hooks[hook] = ((answer: never) => {
      clearTimeout(timer);
      delete hooks[hook];
      resolve(answer);
    }) as never;
    ask();
  });
}

/** The kinds of health data the user allowed (asking Health Connect's screen first when `request`). */
export function healthGrant(request = false): Promise<HealthGrant> {
  const app = androidApp()!;
  return healthAnswer("__orbisHealth", () => (request ? app.healthRequest!() : app.healthCheck!()), request ? 10 * 60_000 : 30_000);
}

/** The last `days` days of health data, read by the app. */
export function healthRead(days: number): Promise<HealthRead> {
  return healthAnswer("__orbisHealthData", () => androidApp()!.healthRead!(days));
}

export function androidApp(): AndroidApp | null {
  return (window as unknown as { orbisAndroid?: AndroidApp }).orbisAndroid ?? null;
}

/** An optional function of the Android app, when this app has it. */
export function androidCan<K extends keyof AndroidApp>(name: K): boolean {
  return typeof androidApp()?.[name] === "function";
}

let revive: ReturnType<typeof setTimeout> | null = null;

/**
 * The stream to the hub dropped or came back (specs/android-app). In the Android app, a hub on this phone
 * that stays down — Android may stop Termux to save battery — is started again: a few seconds after the
 * drop, then every 30 s until it answers. Elsewhere nothing happens.
 */
export function keepLocalHubUp(connected: boolean, firstMs = 4_000, everyMs = 30_000): void {
  if (revive) clearTimeout(revive);
  revive = null;
  if (connected || !androidCan("ensureLocalHub")) return;
  const later = (ms: number) => {
    revive = setTimeout(() => {
      androidApp()?.ensureLocalHub?.();
      later(everyMs);
    }, ms);
  };
  later(firstMs);
}

/** Save a text file the user asked for: to Downloads in the Android app, as a download in a browser. */
export function saveTextFile(name: string, text: string, type = "text/plain;charset=utf-8"): void {
  const android = androidApp();
  if (android) {
    android.saveText(name, type, text);
    return;
  }
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([text], { type }));
  link.download = name;
  link.click();
  URL.revokeObjectURL(link.href);
}

type Hooks = {
  __orbisBack?: () => boolean;
  __orbisOpenConversation?: (conversationId: string) => void;
  __orbisShare?: (text: string) => void;
};

/**
 * What the phone's Back button closes first, most recent first; the Android app asks this before leaving.
 * Returns whether something was closed.
 */
export function setBackHandler(handler: (() => boolean) | null): void {
  (window as unknown as Hooks).__orbisBack = handler ?? undefined;
}

/** Sheets open over a screen (an MCP's details, a candidate's résumé), newest last. */
const layers: Array<() => void> = [];

/** Register a sheet the phone's Back closes before anything else; returns the function that forgets it. */
export function addBackLayer(close: () => void): () => void {
  layers.push(close);
  return () => {
    const at = layers.lastIndexOf(close);
    if (at >= 0) layers.splice(at, 1);
  };
}

/** Close the newest sheet, if one is open. */
export function closeBackLayer(): boolean {
  const close = layers.pop();
  if (!close) return false;
  close();
  return true;
}

/** A tap on a notification: the app asks the page to open its conversation. */
export function setOpenConversationHandler(handler: ((conversationId: string) => void) | null): void {
  (window as unknown as Hooks).__orbisOpenConversation = handler ?? undefined;
}

/** Text shared into the app from another one (a link, a note): the page puts it in a message box. */
export function setShareHandler(handler: ((text: string) => void) | null): void {
  (window as unknown as Hooks).__orbisShare = handler ?? undefined;
}
