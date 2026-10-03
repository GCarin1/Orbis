// specs/android-app, specs/hub-api — pairing a phone, end to end: the web app on the computer makes a code in
// Settings → Phone, and the code (as the Android app sends it, with no token) is traded once for the token; the
// QR code's link opens the web app on a phone signed in, and a code typed on the sign-in screen does too.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { build } from "vite";
import { chromium, type Browser } from "playwright-core";
import { createHub, type Hub } from "@orbis/hub";

const TOKEN = "e2e-pairing";
const webRoot = path.resolve(import.meta.dirname, "../../packages/web");

let hub: Hub;
let url: string;
let browser: Browser;
const dirs: string[] = [];

beforeAll(async () => {
  const outDir = mkdtempSync(path.join(tmpdir(), "orbis-e2e-web-"));
  const dataDir = mkdtempSync(path.join(tmpdir(), "orbis-e2e-data-"));
  dirs.push(outDir, dataDir);
  await build({ root: webRoot, configFile: path.join(webRoot, "vite.config.ts"), logLevel: "error", build: { outDir, emptyOutDir: true, sourcemap: false } });
  hub = await createHub({ env: {}, config: { dataDir, token: TOKEN, port: 0, webDir: outDir } });
  url = await hub.listen();
  const executablePath = process.env.ORBIS_BROWSER_EXECUTABLE || undefined;
  browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
});

afterAll(async () => {
  await browser?.close();
  await hub?.close();
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

describe("pairing a phone", () => {
  it("makes a code in Settings → Phone that the phone trades for the token, once", async () => {
    const page = await (await browser.newContext({ locale: "en-US" })).newPage();
    await page.goto(`${url}/#token=${TOKEN}`);
    await page
      .getByRole("button", { name: /Settings/ })
      .first()
      .click();
    await page.getByRole("tab", { name: "Phone" }).click();
    await page.getByRole("button", { name: "Make a code" }).click();
    const code = (await page.getByTestId("pairing-code").textContent())!.replace(/\s/g, "");
    expect(code).toMatch(/^\d{6}$/);
    await page.getByText(/works once, for [45]:\d\d more/).waitFor();
    // The hub listens on this computer only here (127.0.0.1): the card says how to open it to the phone.
    await page.getByText(/listens on this computer only/).waitFor();

    const claim = (c: string) =>
      fetch(`${url}/api/v1/pairing/claim`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: c }) });
    const first = await claim(`${code.slice(0, 3)} ${code.slice(3)}`);
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ token: TOKEN });
    expect((await claim(code)).status).toBe(401);
  }, 60_000);

  it("signs a phone's browser in from the QR code's link, and from a code typed on the sign-in screen", async () => {
    const computer = await (await browser.newContext({ locale: "en-US" })).newPage();
    await computer.goto(`${url}/#token=${TOKEN}`);
    const makeCode = async () => {
      await computer
        .getByRole("button", { name: /Settings/ })
        .first()
        .click();
      await computer.getByRole("tab", { name: "Phone" }).click();
      await computer.getByRole("button", { name: /Make (a|another) code/ }).click();
      return (await computer.getByTestId("pairing-code").textContent())!.replace(/\s/g, "");
    };
    const code = await makeCode();
    const link = (await computer.getByTestId("pairing-qr").getAttribute("data-link"))!;
    expect(link).toMatch(new RegExp(`^https?://[^/]+/#pair=${code}$`));
    await computer.getByRole("img", { name: /QR code to connect the phone at/ }).waitFor();

    // The phone's camera opens the link in its browser: the hub here is on 127.0.0.1, so the test opens the
    // same fragment on it. The web app trades the code, signs in and drops the code from the address bar.
    const phone = await (await browser.newContext({ locale: "en-US", viewport: { width: 390, height: 844 }, isMobile: true })).newPage();
    await phone.goto(`${url}/${link.slice(link.indexOf("#"))}`);
    await expect.poll(() => phone.evaluate(() => localStorage.getItem("orbis.token"))).toBe(TOKEN);
    await phone.locator("main.gate").waitFor({ state: "detached" });
    expect(new URL(phone.url()).hash).toBe("");

    // The same link again: the code is used up, and the sign-in screen says so.
    const again = await (await browser.newContext({ locale: "en-US" })).newPage();
    await again.goto(`${url}/${link.slice(link.indexOf("#"))}`);
    await again.getByText(/Wrong, used or expired code/).waitFor();

    // The 6 digits typed where the token goes sign in too.
    await computer.reload();
    const typed = await makeCode();
    await again.getByLabel("API token").fill(`${typed.slice(0, 3)} ${typed.slice(3)}`);
    await again.getByRole("button", { name: "Connect" }).click();
    await again.locator("main.gate").waitFor({ state: "detached" });
    expect(await again.evaluate(() => localStorage.getItem("orbis.token"))).toBe(TOKEN);
  }, 90_000);
});
