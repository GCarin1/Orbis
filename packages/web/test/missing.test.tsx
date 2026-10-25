// specs/web-app — a disabled button says what it waits for (change 0088-buttons-say-why).
import { beforeEach, describe, expect, it } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { TokenGate } from "../src/components/TokenGate.js";
import { useLang } from "../src/i18n.js";

beforeEach(() => {
  act(() => useLang.getState().setLang("pt-BR"));
});

describe("a disabled button", () => {
  it("says what is missing, and the line goes once it is there", () => {
    render(<TokenGate onToken={() => undefined} />);
    expect((screen.getByRole("button", { name: "Conectar" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId("missing").textContent).toBe("Cole o código de acesso do seu Orbis para conectar.");
    fireEvent.change(screen.getByPlaceholderText(/token|código/i), { target: { value: "abc" } });
    expect(screen.queryByTestId("missing")).toBeNull();
    expect((screen.getByRole("button", { name: "Conectar" }) as HTMLButtonElement).disabled).toBe(false);
  });
});
