// specs/web-app — the bot settings panel.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { BotSettings } from "../src/components/BotSettings.js";
import { useLang } from "../src/i18n.js";
import { bot } from "./fixtures.js";

beforeEach(() => {
  act(() => useLang.getState().setLang("en"));
});

describe("bot settings", () => {
  it("edits identity, brain, policy rules, computer, allowlists and the spend cap, and saves one patch", async () => {
    const ana = bot({ name: "Ana", role: "QA", policy: { rules: [{ tool: "computer.shell", decision: "ask", locked: true }], grants: ["http.fetch"] } });
    const onSave = vi.fn(async () => undefined);
    const onExport = vi.fn(async () => undefined);
    render(<BotSettings bot={ana} onSave={onSave} onExport={onExport} onDuplicate={async () => undefined} onDelete={async () => undefined} onClose={() => undefined} />);
    const panel = screen.getByTestId("settings-panel");
    fireEvent.change(within(panel).getByLabelText("Role"), { target: { value: "Release QA" } });
    fireEvent.change(within(panel).getByLabelText("Brain"), { target: { value: "anthropic" } });
    fireEvent.change(within(panel).getByLabelText("Model (optional)"), { target: { value: "claude-opus-5" } });
    fireEvent.change(within(panel).getByLabelText("Secret holding the API key (vault name)"), { target: { value: "anthropic_key" } });
    fireEvent.click(within(panel).getByRole("button", { name: "+ Add rule" }));
    const rules = within(panel).getAllByTestId("policy-rule");
    expect(rules).toHaveLength(2);
    fireEvent.change(within(rules[1]!).getByLabelText("Tool"), { target: { value: "browser.*" } });
    fireEvent.change(within(rules[1]!).getByRole("combobox"), { target: { value: "deny" } });
    fireEvent.click(within(panel).getByRole("button", { name: "http.fetch ✕" })); // revoke the grant
    fireEvent.change(within(panel).getByLabelText(/Allowed tools/), { target: { value: "computer.*, browser.*" } });
    fireEvent.change(within(panel).getByLabelText(/Monthly spend cap/), { target: { value: "12.5" } });
    fireEvent.click(within(panel).getByLabelText("Pinned to the top"));
    await act(async () => fireEvent.click(within(panel).getByRole("button", { name: "Save" })));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        role: "Release QA",
        brain: { kind: "anthropic", model: "claude-opus-5", apiKeySecret: "ANTHROPIC_KEY" },
        policy: {
          rules: [
            { tool: "computer.shell", decision: "ask", locked: true },
            { tool: "browser.*", decision: "deny" },
          ],
          grants: [],
        },
        tools: ["computer.*", "browser.*"],
        spendCapUsd: 12.5,
        pinned: true,
      }),
    );
    expect(screen.getByRole("status").textContent).toBe("Saved.");
    await act(async () => fireEvent.click(within(panel).getByRole("button", { name: "Export template" })));
    expect(onExport).toHaveBeenCalled();
  });

  it("clears the spend cap with an empty field and asks before deleting", async () => {
    const onSave = vi.fn(async () => undefined);
    const onDelete = vi.fn(async () => undefined);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<BotSettings bot={bot({ name: "Ana", spendCapUsd: 5 })} onSave={onSave} onExport={async () => undefined} onDuplicate={async () => undefined} onDelete={onDelete} onClose={() => undefined} />);
    fireEvent.change(screen.getByLabelText(/Monthly spend cap/), { target: { value: "" } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save" })));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ spendCapUsd: null }));
    fireEvent.click(screen.getByRole("button", { name: "Delete bot" }));
    expect(confirm).toHaveBeenCalledWith("Delete Ana? Its memory, secrets, routines and computer are erased.");
    expect(onDelete).not.toHaveBeenCalled();
    confirm.mockRestore();
  });
});
