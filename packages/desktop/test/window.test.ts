// specs/desktop-app — acceptance criterion 3 (the hardened window).
import { describe, expect, it, vi } from "vitest";
import { externalTarget, guardWebContents, isAllowedNavigation, windowOptions } from "../src/window.js";

describe("window", () => {
  it("isolates the renderer: context isolation on, Node integration off, sandbox on (criterion 3)", () => {
    const options = windowOptions("/app/preload.cjs");
    expect(options.webPreferences).toMatchObject({
      preload: "/app/preload.cjs",
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
    });
  });

  it("blocks navigation to other origins and opens web links in the system browser (criterion 3)", () => {
    const hub = "http://127.0.0.1:7420";
    expect(isAllowedNavigation("http://127.0.0.1:7420/#token=x", hub)).toBe(true);
    expect(isAllowedNavigation("http://127.0.0.1:7421/", hub)).toBe(false);
    expect(isAllowedNavigation("https://evil.example/", hub)).toBe(false);
    expect(isAllowedNavigation("file:///etc/passwd", hub)).toBe(false);
    expect(externalTarget("javascript:alert(1)")).toBeNull();

    const handlers = new Map<string, (event: { preventDefault(): void }, url: string) => void>();
    let openHandler: ((details: { url: string }) => { action: string }) | null = null;
    const contents = {
      on: (name: string, fn: (event: { preventDefault(): void }, url: string) => void) => void handlers.set(name, fn),
      setWindowOpenHandler: (fn: (details: { url: string }) => { action: string }) => void (openHandler = fn),
    };
    const opened: string[] = [];
    guardWebContents(contents as never, hub, (url) => opened.push(url));

    const stay = { preventDefault: vi.fn() };
    handlers.get("will-navigate")!(stay, "http://127.0.0.1:7420/usage");
    expect(stay.preventDefault).not.toHaveBeenCalled();
    const away = { preventDefault: vi.fn() };
    handlers.get("will-navigate")!(away, "https://github.com/GCarin1/Orbis");
    expect(away.preventDefault).toHaveBeenCalled();
    const file = { preventDefault: vi.fn() };
    handlers.get("will-navigate")!(file, "file:///etc/passwd");
    expect(file.preventDefault).toHaveBeenCalled();
    const redirect = { preventDefault: vi.fn() };
    handlers.get("will-redirect")!(redirect, "https://evil.example/");
    expect(redirect.preventDefault).toHaveBeenCalled();

    expect(openHandler!({ url: "https://docs.example/page" })).toEqual({ action: "deny" });
    expect(openHandler!({ url: "file:///tmp/x" })).toEqual({ action: "deny" });
    expect(opened).toEqual(["https://github.com/GCarin1/Orbis", "https://docs.example/page"]);
  });
});
