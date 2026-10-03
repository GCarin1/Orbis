// specs/android-app — the Android app's first screen (packages/android/app/src/main/assets/connect.html),
// in a real browser with the app's bridge stood in for: it hands the typed address (and a pairing code) to
// the app, translates why one is refused, says when the hub did not answer and tries again, offers the
// recent hubs and a copied link, and explains an untrusted certificate.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium, type Browser, type Page } from "playwright-core";

const page = pathToFileURL(path.resolve(import.meta.dirname, "../../packages/android/app/src/main/assets/connect.html")).href;
let browser: Browser;

beforeAll(async () => {
  const executablePath = process.env.ORBIS_BROWSER_EXECUTABLE || undefined;
  browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
});
afterAll(async () => {
  await browser?.close();
});

/** The connect page with a stand-in for the app's `orbisAndroid` bridge, which answers like MainActivity. */
async function open(locale: string, query = ""): Promise<Page> {
  const tab = await (await browser.newContext({ locale, viewport: { width: 390, height: 844 } })).newPage();
  await tab.addInitScript(() => {
    const calls: Array<[string, string]> = [];
    (window as unknown as { calls: typeof calls }).calls = calls;
    (window as unknown as { orbisAndroid: unknown }).orbisAndroid = {
      connect(address: string, code: string) {
        calls.push([address, code]);
        if (!address.trim()) return "empty";
        if (address.startsWith("ftp:")) return "scheme";
        return code.trim() ? "pending" : "";
      },
      clipboardText: () => "No celular, digite:\n  http://192.168.0.10:7420/#token=abc\n",
    };
  });
  await tab.goto(page + query);
  return tab;
}
const calls = (tab: Page) => tab.evaluate(() => (window as unknown as { calls: Array<[string, string]> }).calls);

describe("the Android app's connect screen", () => {
  it("hands the address and the pairing code to the app and translates why one is refused", async () => {
    const tab = await open("pt-BR");
    await tab.getByText("Endereço do Orbis no seu computador").waitFor();
    await tab.getByRole("button", { name: "Conectar" }).click();
    await tab.getByText("Digite o endereço do Orbis.").waitFor();
    await tab.getByLabel("Endereço do Orbis no seu computador").fill("ftp://pc");
    await tab.getByRole("button", { name: "Conectar" }).click();
    await tab.getByText("Use um endereço http:// ou https://.").waitFor();

    // With a code, the app trades it for the token; a wrong one is said.
    await tab.getByLabel("Endereço do Orbis no seu computador").fill("192.168.0.10");
    await tab.getByLabel(/Código de pareamento/).fill("483 219");
    await tab.getByRole("button", { name: "Conectar" }).click();
    await tab.getByRole("button", { name: "Conectando…" }).waitFor();
    await tab.evaluate(() => (window as unknown as { onConnectResult(why: string): void }).onConnectResult("code"));
    await tab.getByText(/Código errado, já usado ou vencido/).waitFor();
    expect(await tab.getByRole("button", { name: "Conectar" }).isEnabled()).toBe(true);
    expect(await calls(tab)).toEqual([
      ["", ""],
      ["ftp://pc", ""],
      ["192.168.0.10", "483 219"],
    ]);
  });

  it("offers the recent hubs and a link copied on the computer", async () => {
    const recent = encodeURIComponent(JSON.stringify(["http://192.168.0.10:7420/", "https://orbis.example.com/"]));
    const tab = await open("pt-BR", `?recent=${recent}`);
    await tab.getByRole("button", { name: "orbis.example.com" }).click();
    expect(await tab.getByLabel("Endereço do Orbis no seu computador").inputValue()).toBe("https://orbis.example.com/");
    await tab.getByRole("button", { name: "Colar" }).click();
    expect(await tab.getByLabel("Endereço do Orbis no seu computador").inputValue()).toBe("http://192.168.0.10:7420/#token=abc");
  });

  it("says why the saved hub did not answer and tries it again by itself, in English too", async () => {
    const hub = encodeURIComponent("http://192.168.0.10:7420/");
    const tab = await open("en-US", `?v=0.1.0%2B7&hub=${hub}&error=${encodeURIComponent("192.168.0.10: net::ERR_CONNECTION_REFUSED")}`);
    expect(await tab.getByLabel("Address of Orbis on your computer").inputValue()).toBe("http://192.168.0.10:7420/");
    await tab.getByText("Orbis did not answer at 192.168.0.10: net::ERR_CONNECTION_REFUSED").waitFor();
    await tab.getByText("Orbis Android · version 0.1.0+7").waitFor();
    await tab
      .getByText(/Orbis-Celular\.bat/)
      .first()
      .waitFor();
    await tab.getByText(/Trying again in \d+ s…/).waitFor();
    await expect.poll(() => calls(tab), { timeout: 15_000 }).toEqual([["http://192.168.0.10:7420/", ""]]);
  }, 30_000);

  it("explains a certificate the phone does not trust, without trying again", async () => {
    const tab = await open("pt-BR", `?hub=${encodeURIComponent("https://pc.local/")}&error=pc.local&cert=1`);
    await tab.getByText(/pc\.local: o certificado desse endereço não é confiável/).waitFor();
    expect(await tab.locator("#retry").isHidden()).toBe(true);
  });
});
