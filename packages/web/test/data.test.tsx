// specs/web-app — Settings → Data (change 0065-export-import): downloading the .orbis file with the secrets
// sealed by a password, and importing one into this hub or into the cloud account, with what came in.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ImportReport } from "@orbis/shared";
import { Api } from "../src/api.js";
import { DataSettings } from "../src/components/DataSettings.js";
import { useLang } from "../src/i18n.js";

const report = (target: ImportReport["target"]): ImportReport => ({
  target,
  exportedAt: "2026-10-08T12:00:00.000Z",
  tables: { bots: { added: 2, skipped: 0 }, items: { added: 7, skipped: 1 }, squads: { added: 0, skipped: 0 } },
  files: { added: 1, skipped: 0 },
  skills: { added: 1, skipped: 0 },
  secrets: { added: 2, skipped: 0, inFile: true, opened: target === "hub" },
  warnings: target === "cloud" ? ["The secrets stay in the file."] : [],
});

beforeEach(() => {
  act(() => useLang.getState().setLang("en"));
  URL.createObjectURL = vi.fn(() => "blob:orbis");
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Settings → Data", () => {
  it("downloads the .orbis file with the secrets sealed by the password typed twice", async () => {
    const api = new Api("tok");
    const exportData = vi.spyOn(api, "exportData").mockResolvedValue(new Blob(["zip"], { type: "application/zip" }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    render(<DataSettings api={api} />);
    const box = screen.getByTestId("data-export");
    const download = within(box).getByRole("button", { name: "Download the .orbis file" }) as HTMLButtonElement;
    expect(download.disabled).toBe(true);
    fireEvent.change(within(box).getByLabelText("File password"), { target: { value: "a long password" } });
    fireEvent.change(within(box).getByLabelText("Repeat the password"), { target: { value: "a long password" } });
    fireEvent.click(download);
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("File downloaded. The keys go sealed by the password you chose."));
    expect(exportData).toHaveBeenCalledWith("a long password");
    expect(click).toHaveBeenCalled();

    // Without the secrets, no password is asked.
    fireEvent.click(within(box).getByRole("checkbox"));
    fireEvent.click(within(box).getByRole("button", { name: "Download the .orbis file" }));
    await waitFor(() => expect(exportData).toHaveBeenLastCalledWith(null));
  });

  it("imports into this hub with the file's password and shows what came in", async () => {
    const api = new Api("tok");
    const importData = vi.spyOn(api, "importData").mockResolvedValue(report("hub"));
    const onImported = vi.fn();
    render(<DataSettings api={api} onImported={onImported} />);
    const box = screen.getByTestId("data-import");
    const file = new File(["zip"], "orbis-2026-10-08.orbis");
    fireEvent.change(within(box).getByLabelText(".orbis file"), { target: { files: [file] } });
    fireEvent.change(within(box).getByLabelText("File password (to bring the keys)"), { target: { value: "a long password" } });
    fireEvent.click(within(box).getByRole("button", { name: "Import" }));
    const shown = await screen.findByTestId("import-report");
    expect(importData).toHaveBeenCalledWith(file, { password: "a long password", cloudSession: undefined });
    expect(within(shown).getByText("Bots").closest("tr")!.textContent).toBe("Bots20");
    expect(within(shown).getByText("Keys and tokens").closest("tr")!.textContent).toBe("Keys and tokens20");
    expect(within(shown).queryByText("Squads")).toBeNull();
    expect(onImported).toHaveBeenCalled();
  });

  it("imports into the cloud account it signs in to, never sending the file's password", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        String(url).endsWith("/api/v1/auth/config")
          ? Response.json({ supabase: { url: "https://proj.supabase.co", key: "sb_publishable_x" }, linked: false })
          : Response.json({ access_token: "access-cloud", refresh_token: "r", expires_in: 3600, user: { id: "u1", email: "ana@example.com" } }),
      ),
    );
    const api = new Api("tok");
    const importData = vi.spyOn(api, "importData").mockResolvedValue(report("cloud"));
    render(<DataSettings api={api} />);
    const box = screen.getByTestId("data-import");
    const file = new File(["zip"], "orbis.orbis");
    fireEvent.change(within(box).getByLabelText(".orbis file"), { target: { files: [file] } });
    fireEvent.click(within(box).getByRole("tab", { name: "Into my cloud account" }));
    expect(within(box).getByText(/never go to the cloud/)).toBeTruthy();
    fireEvent.change(within(box).getByLabelText("Email"), { target: { value: "ana@example.com" } });
    fireEvent.change(within(box).getByLabelText("Password"), { target: { value: "account password" } });
    fireEvent.click(within(box).getByRole("button", { name: "Import" }));
    const shown = await screen.findByTestId("import-report");
    expect(importData).toHaveBeenCalledWith(file, { password: null, cloudSession: "access-cloud" });
    expect(shown.textContent).toContain("Imported into your cloud account");
    expect(shown.textContent).toContain("The secrets stay in the file.");
  });
});
