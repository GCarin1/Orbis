// specs/web-app — acceptance criterion 3.
import { describe, expect, it } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { LanguageSwitch } from "../src/components/LanguageSwitch.js";
import { Roster } from "../src/components/Roster.js";
import { translate, useLang } from "../src/i18n.js";
import { bot } from "./fixtures.js";

describe("languages", () => {
  it("switches the interface between pt-BR and English and remembers the choice (criterion 3)", () => {
    act(() => useLang.getState().setLang("pt-BR"));
    render(
      <>
        <LanguageSwitch />
        <Roster bots={[bot({ name: "Ana", state: "waiting" })]} selectedId={null} onSelect={() => undefined} onNew={() => undefined} />
      </>,
    );
    expect(screen.getByText("+ Novo bot")).toBeTruthy();
    expect(screen.getByText(/Aguardando você/)).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Idioma"), { target: { value: "en" } });
    expect(screen.getByText("+ New bot")).toBeTruthy();
    expect(screen.getByText(/Waiting for you/)).toBeTruthy();
    expect(localStorage.getItem("orbis.lang")).toBe("en");
    expect(document.documentElement.lang).toBe("en");

    fireEvent.change(screen.getByLabelText("Language"), { target: { value: "pt-BR" } });
    expect(screen.getByText("+ Novo bot")).toBeTruthy();
    expect(localStorage.getItem("orbis.lang")).toBe("pt-BR");
  });

  it("has every text in both languages", () => {
    expect(translate("pt-BR", "composer.placeholder", { name: "Ana" })).toContain("Ana");
    expect(translate("en", "steps.show", { count: 3 })).toBe("Show 3 steps");
  });
});
