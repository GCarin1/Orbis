// Audit cycle 5 (change 0027-audit-cycle-5-performance-and-sweep): the send
// error goes away once the user edits the message.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { Composer } from "../src/components/Composer.js";
import { useLang } from "../src/i18n.js";

beforeEach(() => {
  act(() => useLang.getState().setLang("en"));
});

describe("sending", () => {
  it("clears the send error when the user edits the message", async () => {
    const onSend = vi.fn(async () => {
      throw new Error("hub answered 503");
    });
    render(<Composer name="Ana" onSend={onSend} />);
    const box = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: "oi", selectionStart: 2 } });
    await act(async () => fireEvent.keyDown(box, { key: "Enter" }));
    expect(screen.getByTestId("send-error")).toBeTruthy();
    fireEvent.change(box, { target: { value: "oi!", selectionStart: 3 } });
    expect(screen.queryByTestId("send-error")).toBeNull();
  });
});
