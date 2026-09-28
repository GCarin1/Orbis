// specs/web-app — acceptance criterion 4: the composer's autocomplete,
// `@` for member handles and `/` for skills.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { Composer, filterMentions, filterSkills, mentionAt, skillAt, type MentionOption, type SkillOption } from "../src/components/Composer.js";
import { useLang } from "../src/i18n.js";
import { bot } from "./fixtures.js";

const ana = bot({ name: "Ana", role: "QA" });
const bob = bot({ name: "Bob", role: "Engineering" });

beforeEach(() => {
  act(() => useLang.getState().setLang("en"));
});

describe("@ autocomplete", () => {
  const options: MentionOption[] = [
    { handle: "ana", label: "Ana — QA", bot: ana },
    { handle: "bob", label: "Bob — Engineering", bot: bob },
    { handle: "everyone", label: "every member of the group" },
  ];

  it("finds the @word before the caret", () => {
    expect(mentionAt("hi @an", 6)).toEqual({ start: 3, query: "an" });
    expect(mentionAt("@", 1)).toEqual({ start: 0, query: "" });
    expect(mentionAt("mail me@host", 12)).toBeNull();
    expect(mentionAt("@ana done", 9)).toBeNull();
    expect(filterMentions(options, "e").map((o) => o.handle)).toEqual(["everyone", "bob"]);
  });

  it("offers the members as you type @ and completes the handle with Enter (criterion 4, @ part)", async () => {
    const onSend = vi.fn(async () => undefined);
    render(<Composer name="Release" mentions={options} onSend={onSend} />);
    const box = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: "ask @b", selectionStart: 6 } });
    const list = screen.getByRole("listbox");
    const offered = within(list).getAllByRole("option");
    expect(offered).toHaveLength(1);
    expect(offered[0]!.textContent).toContain("@bob Bob — Engineering");
    fireEvent.keyDown(box, { key: "Enter" });
    expect(box.value).toBe("ask @bob ");
    // Keys typed right after a pick stay where they were typed: nothing moves the
    // caret back in a later animation frame (that garbled fast typing).
    fireEvent.change(box, { target: { value: "ask @bob s", selectionStart: 10 } });
    await act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
    expect(box.selectionStart).toBe(10);
    fireEvent.change(box, { target: { value: "ask @bob ", selectionStart: 9 } });
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(onSend).not.toHaveBeenCalled();

    // Arrow keys move the choice; Escape closes the list and Enter sends.
    fireEvent.change(box, { target: { value: "ask @bob and @", selectionStart: 14 } });
    fireEvent.keyDown(box, { key: "ArrowDown" });
    fireEvent.keyDown(box, { key: "Tab" });
    expect(box.value).toBe("ask @bob and @bob ");
    fireEvent.change(box, { target: { value: "ask @bob and @bob thanks @", selectionStart: 26 } });
    fireEvent.keyDown(box, { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
    await act(async () => {
      fireEvent.keyDown(box, { key: "Enter" });
    });
    expect(onSend).toHaveBeenCalledWith("ask @bob and @bob thanks @");
  });
});

describe("/ autocomplete", () => {
  const skills: SkillOption[] = [
    { name: "release-notes", description: "Write the release notes" },
    { name: "review", description: "Review a pull request" },
    { name: "triage", description: "Triage a bug" },
  ];

  it("finds a /skill at the start of the message, after mentions only", () => {
    expect(skillAt("/re", 3)).toEqual({ start: 0, query: "re" });
    expect(skillAt("@ana /tr", 8)).toEqual({ start: 5, query: "tr" });
    expect(skillAt("see /re", 7)).toBeNull();
    expect(skillAt("/review now", 11)).toBeNull();
    expect(filterSkills(skills, "re").map((s) => s.name)).toEqual(["release-notes", "review"]);
  });

  it("offers the skills as you type / and completes the name with Enter (criterion 4, / part)", async () => {
    const onSend = vi.fn(async () => undefined);
    render(<Composer name="Ana" mentions={[{ handle: "ana", label: "Ana — QA", bot: ana }]} skills={skills} onSend={onSend} />);
    const box = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: "/re", selectionStart: 3 } });
    const list = screen.getByRole("listbox", { name: "Skills" });
    const offered = within(list).getAllByRole("option");
    expect(offered.map((o) => o.textContent)).toEqual(["/release-notes Write the release notes", "/review Review a pull request"]);
    fireEvent.keyDown(box, { key: "ArrowDown" });
    fireEvent.keyDown(box, { key: "Enter" });
    expect(box.value).toBe("/review ");
    expect(onSend).not.toHaveBeenCalled();

    fireEvent.change(box, { target: { value: "/review PR 42", selectionStart: 13 } });
    expect(screen.queryByRole("listbox")).toBeNull();
    await act(async () => {
      fireEvent.keyDown(box, { key: "Enter" });
    });
    expect(onSend).toHaveBeenCalledWith("/review PR 42");
  });
});
