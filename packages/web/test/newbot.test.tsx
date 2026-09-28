// specs/web-app — the new-bot screen: the face (color and shape), the manager,
// the suggestions, and what it sends.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { NewBotScreen } from "../src/components/NewBotScreen.js";
import { useLang } from "../src/i18n.js";
import { bot } from "./fixtures.js";

beforeEach(() => {
  act(() => useLang.getState().setLang("en"));
});

describe("new-bot screen", () => {
  it("picks a color and a shape with a live preview, a manager and a brain, and creates the bot", async () => {
    const chief = bot({ name: "Chief", role: "Chief of Staff" });
    const onCreate = vi.fn(async () => undefined);
    render(<NewBotScreen bots={[chief]} onCreate={onCreate} />);
    const create = screen.getByRole("button", { name: "Create bot" }) as HTMLButtonElement;
    expect(create.disabled).toBe(true);

    fireEvent.click(within(screen.getByRole("radiogroup", { name: "Color" })).getByRole("radio", { name: "Pink" }));
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "Shape" })).getByRole("radio", { name: "Cloud" }));
    expect(within(screen.getByRole("radiogroup", { name: "Shape" })).getByRole("radio", { name: "Cloud" }).getAttribute("aria-checked")).toBe("true");
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Dana" } });
    fireEvent.change(screen.getByLabelText("Role"), { target: { value: "Designer" } });
    fireEvent.change(screen.getByLabelText("Reports to"), { target: { value: chief.id } });
    fireEvent.change(screen.getByLabelText("Brain"), { target: { value: "mock" } });
    // The preview is the face being built.
    const preview = screen.getByRole("img", { name: "Dana" });
    expect(preview.classList.contains("face-cloud")).toBe(true);

    await act(async () => fireEvent.click(create));
    expect(onCreate).toHaveBeenCalledWith({
      name: "Dana",
      role: "Designer",
      description: "",
      avatarColor: "#ec4899",
      avatarShape: "cloud",
      reportsTo: chief.id,
      brain: { kind: "mock" },
    });
  });

  it("fills everything from a suggestion, a specialist reporting to the team's chief", () => {
    const chief = bot({ name: "Chief", role: "Chief of Staff" });
    render(<NewBotScreen bots={[chief]} onCreate={async () => undefined} />);
    fireEvent.click(screen.getByTestId("suggestion-qa"));
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("QA");
    expect((screen.getByLabelText("Role") as HTMLInputElement).value).toBe("QA");
    expect((screen.getByLabelText(/Description/) as HTMLTextAreaElement).value).toMatch(/steps to reproduce/);
    expect((screen.getByLabelText("Reports to") as HTMLSelectElement).value).toBe(chief.id);
    expect(within(screen.getByRole("radiogroup", { name: "Shape" })).getByRole("radio", { name: "Square" }).getAttribute("aria-checked")).toBe("true");

    fireEvent.click(screen.getByTestId("suggestion-chief"));
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("Chief of Staff");
    expect((screen.getByLabelText("Reports to") as HTMLSelectElement).value).toBe("");
  });
});
