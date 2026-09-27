// The sandboxed renderer's only bridge (specs/desktop-app): notification and
// settings functions — no token, no Node APIs. CommonJS, as sandboxed preloads require.
import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("orbisDesktop", {
  /** Called with a conversation id when the user clicks a notification. */
  onOpenConversation(callback: (conversationId: string) => void): void {
    ipcRenderer.on("orbis:open-conversation", (_event, conversationId: string) => callback(conversationId));
  },
  notify(title: string, body: string): void {
    ipcRenderer.send("orbis:notify", String(title).slice(0, 200), String(body).slice(0, 500));
  },
  settings: {
    get: (): Promise<{ hubUrl: string }> => ipcRenderer.invoke("orbis:settings:get"),
    setHubUrl: (hubUrl: string): Promise<void> => ipcRenderer.invoke("orbis:settings:set-hub-url", String(hubUrl)),
  },
});
