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
