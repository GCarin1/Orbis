// specs/computer — acceptance criterion 5 (browser tools on a per-bot profile),
// and the takeover request on password, CAPTCHA and verification pages.
import { afterEach, beforeAll, afterAll, describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { Run } from "@orbis/shared";
import { chat, createBot, testHub, type TestHub } from "../helpers.js";

let t: TestHub | null = null;
let server: Server;
let base: string;

const PAGES: Record<string, string> = {
  "/": `<html><head><title>Release notes</title></head><body>
    <h1>Release 4.2</h1><p>All smoke tests passed.</p>
    <a href="/details">Details</a>
    <form action="/search"><label>Query <input name="q"></label><button>Search</button></form>
  </body></html>`,
  "/details": `<html><head><title>Details</title></head><body><p>Build 1234 is green.</p></body></html>`,
  "/login": `<html><head><title>Sign in</title></head><body><form><label>Email <input name="email"></label>
    <label>Password <input type="password" name="pw"></label><button>Sign in</button></form></body></html>`,
  "/captcha": `<html><head><title>Check</title></head><body><div class="g-recaptcha"></div><p>Prove you are human.</p></body></html>`,
};

beforeAll(async () => {
  server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    if (url.pathname === "/set") {
      res.writeHead(200, { "content-type": "text/html", "set-cookie": "session=abc123; Max-Age=3600; Path=/" });
      res.end("<title>Set</title><p>cookie set</p>");
    } else if (url.pathname === "/whoami") {
      res.writeHead(200, { "content-type": "text/html" });
      res.end(`<title>Who</title><p>cookie: ${req.headers.cookie ?? "none"}</p>`);
    } else if (url.pathname === "/search") {
      res.writeHead(200, { "content-type": "text/html" });
      res.end(`<title>Results</title><p>You searched for ${url.searchParams.get("q")}</p>`);
    } else {
      res.writeHead(200, { "content-type": "text/html" });
      res.end(PAGES[url.pathname] ?? "<p>not found</p>");
    }
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
});
afterEach(async () => {
  await t?.cleanup();
  t = null;
});

const results = (run: Run) => run.steps.filter((s) => s.type === "tool_result");
const tool = (name: string, input: object = {}) => `/tool ${name} ${JSON.stringify(input)}`;

describe("browser tools", () => {
  it("opens a local page and returns its text snapshot with references; click and type act on them (criterion 5)", async () => {
    t = await testHub();
    const bot = await createBot(t);
    const { runs } = await chat(
      t,
      bot.id,
      [tool("browser.open", { url: `${base}/` }), tool("browser.click", { ref: "l1" }), tool("browser.open", { url: `${base}/` }), tool("browser.type", { ref: "f1", value: "flaky", submit: true })].join("\n"),
    );
    const [opened, clicked, , typed] = results(runs[0]);
    expect(opened!.isError).toBe(false);
    expect(opened!.output).toMatch(new RegExp(`^<untrusted-content source="${base}/">`));
    expect(opened!.output).toContain("Title: Release notes");
    expect(opened!.output).toContain("All smoke tests passed.");
    expect(opened!.output).toContain(`[l1] Details → ${base}/details`);
    expect(opened!.output).toContain('[f1] input:text "Query"');
    expect(opened!.output).toContain("[b1] Search");
    expect(clicked!.output).toContain("Build 1234 is green.");
    expect(typed!.output).toContain("You searched for flaky");

    // The live view has a screenshot now; reading it announces nothing new (no fetch loop).
    const announced = t.events.filter((e) => e.type === "computer.updated").length;
    const shot = await t.hub.app.inject({ method: "GET", url: `/api/v1/bots/${bot.id}/computer/screenshot`, headers: { authorization: "Bearer test-token" } });
    expect(shot.statusCode).toBe(200);
    expect(shot.headers["content-type"]).toBe("image/png");
    expect(shot.rawPayload.subarray(1, 4).toString()).toBe("PNG");
    expect(t.events.filter((e) => e.type === "computer.updated").length).toBe(announced);
    expect((await t.api("GET", `/api/v1/bots/${bot.id}/computer`)).body.screenshotAt).not.toBeNull();
  });

  it("keeps cookies in the bot's own profile across browser restarts, and not in another bot's", async () => {
    t = await testHub();
    const ana = await createBot(t, { name: "Ana" });
    const bob = await createBot(t, { name: "Bob" });
    await chat(t, ana.id, [tool("browser.open", { url: `${base}/set` }), tool("browser.close")].join("\n"));
    expect(t.hub.browser.isOpen(ana.id)).toBe(false);
    expect(existsSync(t.hub.computer.paths(ana.id).browserProfile)).toBe(true);

    const again = await chat(t, ana.id, tool("browser.open", { url: `${base}/whoami` }));
    expect(results(again.runs[0])[0]!.output).toContain("cookie: session=abc123");
    const other = await chat(t, bob.id, tool("browser.open", { url: `${base}/whoami` }));
    expect(results(other.runs[0])[0]!.output).toContain("cookie: none");
  });

  it("asks for a takeover on password and CAPTCHA pages and refuses to type a password", async () => {
    t = await testHub();
    const bot = await createBot(t);
    const { runs } = await chat(
      t,
      bot.id,
      [tool("browser.open", { url: `${base}/login` }), tool("browser.type", { ref: "f2", value: "hunter2" }), tool("browser.open", { url: `${base}/captcha` })].join("\n"),
    );
    const [login, typed, captcha] = results(runs[0]);
    expect(login!.output).toMatch(/This page asks for a password\. Never try to solve or bypass .* Ask the user to take over your computer/);
    expect(typed).toMatchObject({ isError: true, output: expect.stringMatching(/typing into a password field is not allowed: ask the user to take over/) });
    expect(captcha!.output).toMatch(/This page asks for a CAPTCHA/);
  });

  it("opens only http and https pages", async () => {
    t = await testHub();
    const bot = await createBot(t);
    const { runs } = await chat(t, bot.id, [tool("browser.open", { url: "file:///etc/passwd" }), tool("browser.screenshot")].join("\n"));
    const [file, shot] = results(runs[0]);
    expect(file).toMatchObject({ isError: true, output: "browser.open only opens http and https pages" });
    expect(shot).toMatchObject({ isError: true, output: "your browser is not open; use browser.open first" });
  });
});
