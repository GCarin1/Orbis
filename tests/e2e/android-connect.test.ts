// specs/android-app — the Android app's first screen (packages/android/app/src/main/assets/connect.html),
// in a real browser with the app's bridge stood in for. Orbis on this phone comes first: one button starts
// it inside Termux and opens it — no computer, no sign-in — with the one-time setup when Termux or the
// permission is missing (change 0052). Another Orbis is a choice below: the page hands the typed address
// (and a pairing code) to the app, translates why one is refused, says when the hub did not answer and
// tries again, offers the recent hubs and a copied link, reads a QR code, and explains a certificate.
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

/**
 * The connect page with a stand-in for the app's `orbisAndroid` bridge, which answers like MainActivity.
 * `local` is what the app says of Termux ("ready", "no-termux", "no-permission"), or null for an app
 * without the hub on the phone (an older one).
 */
async function open(locale: string, query = "", local: string | null = null): Promise<Page> {
  const tab = await (await browser.newContext({ locale, viewport: { width: 390, height: 844 } })).newPage();
  await tab.addInitScript((localState) => {
    const calls: Array<[string, string]> = [];
    (window as unknown as { calls: typeof calls }).calls = calls;
    const asked: string[] = [];
    (window as unknown as { asked: typeof asked }).asked = asked;
    const onPhone = localState
      ? {
          localState: () => localState,
          startLocal: () => asked.push("startLocal"),
          stopWaiting: () => asked.push("stopWaiting"),
          installCommand: () =>
            "curl -fsSLo orbis-termux.sh https://raw.githubusercontent.com/someone/Orbis/HEAD/scripts/android/orbis-termux.sh && bash orbis-termux.sh",
          copyInstallCommand: () => asked.push("copyInstallCommand"),
          openTermux: () => asked.push("openTermux"),
          getTermux: () => asked.push("getTermux"),
          openAppSettings: () => asked.push("openAppSettings"),
        }
      : {};
    (window as unknown as { orbisAndroid: unknown }).orbisAndroid = {
      ...onPhone,
      connect(address: string, code: string) {
        calls.push([address, code]);
        if (!address.trim()) return "empty";
        if (address.startsWith("ftp:")) return "scheme";
        return code.trim() ? "pending" : "";
      },
      clipboardText: () => "No celular, digite:\n  http://192.168.0.10:7420/#token=abc\n",
      // Google Play's scanner answers later, as the app does: what the test put in `scan`.
      scanQr() {
        const scan = (window as unknown as { scan: [string | null, string | null] }).scan;
        setTimeout(() => (window as unknown as { onScanned(text: string | null, why: string | null): void }).onScanned(...scan), 10);
      },
    };
  }, local);
  await tab.goto(page + query);
  return tab;
}
const calls = (tab: Page) => tab.evaluate(() => (window as unknown as { calls: Array<[string, string]> }).calls);
const asked = (tab: Page) => tab.evaluate(() => (window as unknown as { asked: string[] }).asked);
const onLocal = (tab: Page, state: string, detail: string | null = null) =>
  tab.evaluate(([s, d]) => (window as unknown as { onLocal(state: string, detail: string | null): void }).onLocal(s!, d ?? null), [state, detail]);

describe("Orbis on this phone, on the first screen", () => {
  it("opens Orbis on this phone with one button — no computer, no sign-in — and says how the start goes", async () => {
    const tab = await open("pt-BR", "", "ready");
    await tab.getByRole("heading", { name: "📱 Orbis neste celular" }).waitFor();
    await tab.getByText(/sem computador, sem servidor e sem login/).waitFor();
    // Another Orbis stays a choice, closed; the one-time setup is not needed.
    expect(await tab.getByLabel("Endereço do outro Orbis").isVisible()).toBe(false);
    expect(await tab.locator("#local-setup").isHidden()).toBe(true);

    await tab.getByRole("button", { name: "Abrir o Orbis" }).click();
    expect(await asked(tab)).toEqual(["startLocal"]);
    await onLocal(tab, "starting", "3");
    await tab.getByText("Ligando o Orbis no Termux… 3 s").waitFor();
    expect(await tab.getByRole("button", { name: "Ligando o Orbis…" }).isDisabled()).toBe(true);
    await onLocal(tab, "starting", "20");
    await tab.getByText(/A primeira vez depois de ligar o celular leva mais/).waitFor();
    await tab.getByRole("button", { name: "Parar de esperar" }).click();
    expect(await asked(tab)).toEqual(["startLocal", "stopWaiting"]);
    expect(await tab.getByRole("button", { name: "Abrir o Orbis" }).isEnabled()).toBe(true);

    // The hub in Termux stopped: why, with its last lines.
    await onLocal(tab, "stopped", "Error: listen EADDRINUSE 127.0.0.1:7420");
    await tab.getByRole("alert").filter({ hasText: "O Orbis no Termux parou:" }).waitFor();
    await tab.getByText("Error: listen EADDRINUSE 127.0.0.1:7420").waitFor();
  });

  it("starts by itself when the app opens on the hub on this phone", async () => {
    const tab = await open("en-US", "?local=start", "ready");
    await tab.getByRole("heading", { name: "📱 Orbis on this phone" }).waitFor();
    expect(await asked(tab)).toEqual(["startLocal"]);
    expect(await tab.getByLabel("Address of the other Orbis").isVisible()).toBe(false);
  });

  it("without Termux, shows the one-time setup: get Termux, copy the command, open Termux", async () => {
    const tab = await open("pt-BR", "", "no-termux");
    const setup = tab.locator("#local-setup");
    await setup.getByText("Primeira vez? Prepare o celular, uma vez só:").waitFor();
    await setup.getByText(/raw\.githubusercontent\.com\/someone\/Orbis\/HEAD\/scripts\/android\/orbis-termux\.sh/).waitFor();
    await setup.getByRole("button", { name: "Baixar o Termux" }).click();
    await setup.getByRole("button", { name: "Copiar comando" }).click();
    await setup.getByRole("button", { name: "Abrir o Termux" }).click();
    expect(await asked(tab)).toEqual(["getTermux", "copyInstallCommand", "openTermux"]);
    // Termux there, Orbis not installed in it yet, or Termux refusing the app: the setup again, and why.
    await onLocal(tab, "not-installed");
    await tab.getByText("O Orbis ainda não está instalado no Termux: faça o passo 2.").waitFor();
    await onLocal(tab, "external-apps");
    await tab.getByText(/O Termux recusou o pedido do app/).waitFor();
    expect(await setup.isVisible()).toBe(true);
  });

  it("asks for the Termux permission, and opens the app's settings where it is granted by hand", async () => {
    const tab = await open("pt-BR", "", "no-permission");
    await tab.getByText(/Permissões adicionais/).waitFor();
    await onLocal(tab, "no-permission");
    await tab.getByText(/O Orbis precisa da permissão “Executar comandos no ambiente do Termux”/).waitFor();
    await tab.getByRole("button", { name: "Permissões do app" }).click();
    expect(await asked(tab)).toEqual(["openAppSettings"]);
  });

  it("keeps the address of another Orbis open when one was used", async () => {
    const tab = await open("pt-BR", `?hub=${encodeURIComponent("http://192.168.0.10:7420/")}`, "ready");
    expect(await tab.getByLabel("Endereço do outro Orbis").inputValue()).toBe("http://192.168.0.10:7420/");
    await tab.getByRole("heading", { name: "📱 Orbis neste celular" }).waitFor();
  });
});

describe("another Orbis, on the first screen", () => {
  it("hands the address and the pairing code to the app and translates why one is refused", async () => {
    const tab = await open("pt-BR");
    await tab.getByText("Endereço do outro Orbis").waitFor();
    await tab.getByRole("button", { name: "Conectar" }).click();
    await tab.getByText("Digite o endereço do Orbis.").waitFor();
    await tab.getByLabel("Endereço do outro Orbis").fill("ftp://pc");
    await tab.getByRole("button", { name: "Conectar" }).click();
    await tab.getByText("Use um endereço http:// ou https://.").waitFor();

    // With a code, the app trades it for the token; a wrong one is said.
    await tab.getByLabel("Endereço do outro Orbis").fill("192.168.0.10");
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
    expect(await tab.getByLabel("Endereço do outro Orbis").inputValue()).toBe("https://orbis.example.com/");
    await tab.getByRole("button", { name: "Colar" }).click();
    expect(await tab.getByLabel("Endereço do outro Orbis").inputValue()).toBe("http://192.168.0.10:7420/#token=abc");
  });

  it("reads the computer's QR code and connects with its address and code, or says why not", async () => {
    const tab = await open("pt-BR");
    const scan = async (text: string | null, why: string | null) => {
      await tab.evaluate((s) => ((window as unknown as { scan: unknown }).scan = s), [text, why]);
      await tab.getByRole("button", { name: "Ler QR code" }).click();
    };
    await tab.getByText("ou digite o endereço", { exact: true }).waitFor();
    await scan("https://example.com/menu", null);
    await tab.getByText(/Esse QR code não é de um Orbis/).waitFor();
    await scan(null, "unavailable");
    await tab.getByText(/não tem o leitor de QR code do Google Play/).waitFor();
    await scan(null, "cancelled");
    await scan("http://192.168.0.10:7420/#pair=483219", null);
    await tab.getByRole("button", { name: "Conectando…" }).waitFor();
    expect(await tab.getByLabel("Endereço do outro Orbis").inputValue()).toBe("http://192.168.0.10:7420/");
    expect(await calls(tab)).toEqual([["http://192.168.0.10:7420/", "483219"]]);
  });

  it("says why the saved hub did not answer and tries it again by itself, in English too", async () => {
    const hub = encodeURIComponent("http://192.168.0.10:7420/");
    const tab = await open("en-US", `?v=0.1.0%2B7&hub=${hub}&error=${encodeURIComponent("192.168.0.10: net::ERR_CONNECTION_REFUSED")}`);
    expect(await tab.getByLabel("Address of the other Orbis").inputValue()).toBe("http://192.168.0.10:7420/");
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
