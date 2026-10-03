// specs/android-app — the Android app's first screen (packages/android/app/src/main/assets/connect.html),
// in a real browser with the app's bridge stood in for: it hands the typed address to the app, translates
// why one is refused, and says when the hub did not answer.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium, type Browser } from "playwright-core";

const page = pathToFileURL(path.resolve(import.meta.dirname, "../../packages/android/app/src/main/assets/connect.html")).href;
let browser: Browser;

beforeAll(async () => {
  const executablePath = process.env.ORBIS_BROWSER_EXECUTABLE || undefined;
  browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
});
afterAll(async () => {
  await browser?.close();
});

/** The connect page with a stand-in for the app's `orbisAndroid` bridge, which answers like Hub.parse. */
async function open(locale: string, query = "") {
  const tab = await (await browser.newContext({ locale, viewport: { width: 390, height: 844 } })).newPage();
  await tab.addInitScript(() => {
    const calls: string[] = [];
    (window as unknown as { calls: string[] }).calls = calls;
    (window as unknown as { orbisAndroid: unknown }).orbisAndroid = {
      connect(address: string) {
        calls.push(address);
        if (!address.trim()) return "empty";
        if (address.startsWith("ftp:")) return "scheme";
        return "";
      },
    };
  });
  await tab.goto(page + query);
  return tab;
}

describe("the Android app's connect screen", () => {
  it("hands the address to the app and translates why one is refused", async () => {
    const tab = await open("pt-BR");
    await tab.getByText("Endereço do Orbis no seu computador").waitFor();
    await tab.getByRole("button", { name: "Conectar" }).click();
    await tab.getByText("Digite o endereço do Orbis.").waitFor();
    await tab.getByLabel("Endereço do Orbis no seu computador").fill("ftp://pc");
    await tab.getByRole("button", { name: "Conectar" }).click();
    await tab.getByText("Use um endereço http:// ou https://.").waitFor();
    await tab.getByLabel("Endereço do Orbis no seu computador").fill("192.168.0.10");
    await tab.getByRole("button", { name: "Conectar" }).click();
    expect(await tab.evaluate(() => (window as unknown as { calls: string[] }).calls)).toEqual(["", "ftp://pc", "192.168.0.10"]);
    expect(await tab.getByRole("alert").isHidden()).toBe(true);
  });

  it("shows the saved hub, why it did not answer and the app's version, in English too", async () => {
    const tab = await open(
      "en-US",
      `?v=0.1.0%2B7&hub=${encodeURIComponent("http://192.168.0.10:7420/")}&error=${encodeURIComponent("192.168.0.10: net::ERR_CONNECTION_REFUSED")}`,
    );
    expect(await tab.getByLabel("Address of Orbis on your computer").inputValue()).toBe("http://192.168.0.10:7420/");
    await tab.getByText("Orbis did not answer at 192.168.0.10: net::ERR_CONNECTION_REFUSED").waitFor();
    await tab.getByText("Orbis Android · version 0.1.0+7").waitFor();
    await tab.getByText(/Orbis-Celular\.bat/).waitFor();
  });
});
