// The browser of a bot's computer, driven with Playwright (specs/computer).
// `local`: a persistent Chromium context on the bot's own profile directory.
// `host`: the same, as a visible window on the user's screen, in the Chrome or
// Edge installed there when there is one.
// `docker`: the Chromium inside the bot's container, reached over CDP — the
// same window the user sees in noVNC. Pages reach the model as text
// snapshots; interactive elements get references (`l3`, `f1`, `b2`).
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Browser, BrowserContext, Page } from "playwright-core";
import type { Bot } from "@orbis/shared";
import { hasDisplay } from "./host.js";
import type { ComputerManager } from "./manager.js";
import { READ_PAGE } from "./page-script.js";

const VIEWPORT = { width: 1280, height: 800 };
const NAV_TIMEOUT_MS = 30_000;
const ACTION_TIMEOUT_MS = 10_000;
const SNAPSHOT_TEXT_CHARS = 12_000;

interface Session {
  context: BrowserContext;
  page: Page;
  /** Set when attached over CDP: closing detaches instead of closing the user's browser. */
  browser: Browser | null;
}

export interface PageSnapshot {
  title: string;
  url: string;
  text: string;
  links: Array<{ ref: string; text: string; href: string }>;
  fields: Array<{ ref: string; kind: string; label: string; value: string }>;
  buttons: Array<{ ref: string; text: string }>;
  password: boolean;
  captcha: boolean;
  otp: boolean;
}

/** The snapshot as the model reads it. */
export function formatSnapshot(s: PageSnapshot): string {
  const lines = [`Title: ${s.title || "(untitled)"}`, `URL: ${s.url}`, ""];
  const text = s.text.replace(/\n{3,}/g, "\n\n").trim();
  lines.push(text.length > SNAPSHOT_TEXT_CHARS ? `${text.slice(0, SNAPSHOT_TEXT_CHARS)}\n[… ${text.length - SNAPSHOT_TEXT_CHARS} more characters of page text]` : text || "(no text)");
  if (s.links.length) lines.push("", "Links:", ...s.links.map((l) => `[${l.ref}] ${l.text || "(no text)"} → ${l.href}`));
  if (s.fields.length) lines.push("", "Fields:", ...s.fields.map((f) => `[${f.ref}] ${f.kind} "${f.label}"${f.value ? ` = ${f.value}` : ""}`));
  if (s.buttons.length) lines.push("", "Buttons:", ...s.buttons.map((b) => `[${b.ref}] ${b.text || "(no text)"}`));
  const asks = [s.captcha && "a CAPTCHA", s.otp && "a verification code", s.password && "a password"].filter(Boolean);
  if (asks.length) {
    lines.push(
      "",
      `⚠ This page asks for ${asks.join(" and ")}. Never try to solve or bypass a CAPTCHA or a verification step, and do not type a password. ` +
        "Ask the user to take over your computer (Take over, in the Orbis app), finish this step themselves and hand control back; then continue.",
    );
  }
  return lines.join("\n");
}

export class TakeoverNeeded extends Error {}

export class BrowserService {
  private readonly sessions = new Map<string, Session>();
  private readonly opening = new Map<string, Promise<Session>>();
  private readonly screenshots = new Map<string, Buffer>();

  constructor(
    private readonly computers: ComputerManager,
    private readonly executablePath: string | null = null,
  ) {
    computers.attach({ stop: (botId) => this.close(botId) });
  }

  private async open(bot: Bot): Promise<Session> {
    const provider = await this.computers.ensure(bot);
    const { chromium } = await import("playwright-core");
    if (provider.kind === "docker") {
      const view = await provider.view(bot.id);
      if (!view.cdpPort) throw new Error("the computer's browser is not reachable yet (no DevTools port); try again in a few seconds");
      const browser = await chromium.connectOverCDP(`http://127.0.0.1:${view.cdpPort}`);
      const context = browser.contexts()[0] ?? (await browser.newContext({ viewport: VIEWPORT }));
      const page = context.pages()[0] ?? (await context.newPage());
      return { context, page, browser };
    }
    const profile = this.computers.paths(bot.id).browserProfile;
    mkdirSync(profile, { recursive: true, mode: 0o700 });
    const options = {
      acceptDownloads: true,
      downloadsPath: path.join(this.computers.paths(bot.id).workspace, "downloads"),
    };
    let context: BrowserContext | null = null;
    if (provider.kind === "host" && hasDisplay()) {
      // A window the user sees: their Chrome, else Edge (always on Windows), else Playwright's Chromium.
      const channels: Array<string | undefined> = this.executablePath ? [undefined] : ["chrome", "msedge", undefined];
      let lastError: unknown = null;
      for (const channel of channels) {
        try {
          context = await chromium.launchPersistentContext(profile, {
            ...options,
            headless: false,
            viewport: null,
            ...(channel ? { channel } : {}),
            ...(this.executablePath ? { executablePath: this.executablePath } : {}),
          });
          break;
        } catch (err) {
          lastError = err;
        }
      }
      if (!context) throw lastError instanceof Error ? lastError : new Error("no browser could be opened on this computer");
    } else {
      context = await chromium.launchPersistentContext(profile, {
        ...options,
        headless: true,
        viewport: VIEWPORT,
        ...(this.executablePath ? { executablePath: this.executablePath } : {}),
      });
    }
    const page = context.pages()[0] ?? (await context.newPage());
    return { context, page, browser: null };
  }

  /** The bot's current page, opening its browser (and starting its computer) when needed. */
  async page(bot: Bot): Promise<Page> {
    const current = this.sessions.get(bot.id);
    if (current && !current.page.isClosed()) {
      this.computers.touch(bot.id);
      return current.page;
    }
    if (current) {
      const next = current.context.pages().find((p) => !p.isClosed()) ?? (await current.context.newPage());
      current.page = next;
      return next;
    }
    let pending = this.opening.get(bot.id);
    if (!pending) {
      pending = this.open(bot).finally(() => this.opening.delete(bot.id));
      this.opening.set(bot.id, pending);
    }
    const session = await pending;
    session.page.setDefaultTimeout(ACTION_TIMEOUT_MS);
    session.page.setDefaultNavigationTimeout(NAV_TIMEOUT_MS);
    session.context.on("close", () => {
      if (this.sessions.get(bot.id) === session) this.sessions.delete(bot.id);
    });
    this.sessions.set(bot.id, session);
    return session.page;
  }

  isOpen(botId: string): boolean {
    return this.sessions.has(botId);
  }

  async snapshot(bot: Bot): Promise<{ text: string; data: PageSnapshot }> {
    const page = await this.page(bot);
    const data = (await page.evaluate(READ_PAGE)) as PageSnapshot;
    await this.capture(bot, page);
    return { text: formatSnapshot(data), data };
  }

  /** Keep the latest screenshot for the live view. */
  private async capture(bot: Bot, page: Page): Promise<void> {
    try {
      this.screenshots.set(bot.id, await page.screenshot({ type: "png", timeout: 5_000 }));
      this.computers.screenshotTaken(bot);
    } catch {
      /* a page in the middle of navigating; the next action captures again */
    }
  }

  lastScreenshot(botId: string): Buffer | null {
    return this.screenshots.get(botId) ?? null;
  }

  /** A fresh screenshot when the browser is open, else the last one kept. */
  async screenshot(bot: Bot, save = false): Promise<{ png: Buffer; file: string | null } | null> {
    const session = this.sessions.get(bot.id);
    if (session && !session.page.isClosed()) await this.capture(bot, session.page);
    const png = this.screenshots.get(bot.id);
    if (!png) return null;
    let file: string | null = null;
    if (save) {
      const dir = path.join(this.computers.paths(bot.id).workspace, "screenshots");
      mkdirSync(dir, { recursive: true });
      file = path.join(dir, `${new Date().toISOString().replace(/[:.]/g, "-")}.png`);
      writeFileSync(file, png);
    }
    return { png, file };
  }

  async navigate(bot: Bot, url: string): Promise<string> {
    const page = await this.page(bot);
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("load", { timeout: 5_000 }).catch(() => undefined);
    return (await this.snapshot(bot)).text;
  }

  private locate(page: Page, target: { ref?: string; selector?: string; text?: string }) {
    if (target.ref) return page.locator(`[data-orbis-ref="${target.ref.replace(/[^a-z0-9]/gi, "")}"]`).first();
    if (target.selector) return page.locator(target.selector).first();
    if (target.text) return page.getByText(target.text, { exact: false }).first();
    throw new Error("say what to act on: a ref from the snapshot (b1, l3, f2), a CSS selector or a visible text");
  }

  private async settle(page: Page): Promise<void> {
    await page.waitForLoadState("domcontentloaded", { timeout: 5_000 }).catch(() => undefined);
    await page.waitForTimeout(150);
  }

  async click(bot: Bot, target: { ref?: string; selector?: string; text?: string }): Promise<string> {
    const page = await this.page(bot);
    await this.locate(page, target).click();
    await this.settle(page);
    return (await this.snapshot(bot)).text;
  }

  async type(bot: Bot, target: { ref?: string; selector?: string; text?: string }, value: string, submit: boolean): Promise<string> {
    const page = await this.page(bot);
    const field = this.locate(page, target);
    const type = await field.getAttribute("type").catch(() => null);
    if (type?.toLowerCase() === "password") {
      throw new TakeoverNeeded(
        "typing into a password field is not allowed: ask the user to take over your computer, sign in themselves and hand control back",
      );
    }
    await field.fill(value);
    if (submit) await field.press("Enter");
    await this.settle(page);
    return (await this.snapshot(bot)).text;
  }

  async press(bot: Bot, key: string): Promise<string> {
    const page = await this.page(bot);
    await page.keyboard.press(key);
    await this.settle(page);
    return (await this.snapshot(bot)).text;
  }

  /** Close the bot's browser (a CDP attachment is only detached). */
  async close(botId: string): Promise<void> {
    const session = this.sessions.get(botId);
    this.sessions.delete(botId);
    if (!session) return;
    if (session.browser) await session.browser.close().catch(() => undefined);
    else await session.context.close().catch(() => undefined);
  }

  async shutdown(): Promise<void> {
    for (const botId of [...this.sessions.keys()]) await this.close(botId);
  }
}
