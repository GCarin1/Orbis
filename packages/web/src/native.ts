// What the Android app around the web app offers it (specs/android-app): saving a file to the phone's
// Downloads, the hub's address and changing it. In a browser none of it exists and the web app does without.

export interface AndroidApp {
  saveText(name: string, mime: string, text: string): void;
  changeHub(): void;
  hubUrl(): string;
  version(): string;
}

export function androidApp(): AndroidApp | null {
  return (window as unknown as { orbisAndroid?: AndroidApp }).orbisAndroid ?? null;
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

/**
 * What the phone's Back button closes first, most recent first; the Android app asks this before leaving.
 * Returns whether something was closed.
 */
export function setBackHandler(handler: (() => boolean) | null): void {
  (window as unknown as { __orbisBack?: () => boolean }).__orbisBack = handler ?? undefined;
}
