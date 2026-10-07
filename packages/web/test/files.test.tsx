// specs/web-app — files in conversations (change 0059-files-conversations-sends-bots): the composer takes
// files from the clip, a paste or a drop and sends them with the message; a message shows its images, its
// players and its file cards; the conversation's files are listed; a too large file is refused.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ConversationFile, TimelineItem } from "@orbis/shared";
import { Api } from "../src/api.js";
import { Composer } from "../src/components/Composer.js";
import { FilesPanel } from "../src/components/Files.js";
import { Timeline } from "../src/components/Timeline.js";
import { useLang } from "../src/i18n.js";
import { useStore } from "../src/store.js";
import { bot } from "./fixtures.js";

const ana = bot({ name: "Ana", role: "Research" });
const api = new Api("tok-1");

beforeEach(() => {
  act(() => useLang.getState().setLang("en"));
  act(() => useStore.setState({ api, bots: { [ana.id]: ana } }));
});

const file = (over: Partial<ConversationFile> & { name: string; mime: string }): ConversationFile => ({
  id: `fil_${over.name.replace(/\W/g, "")}`,
  conversationId: "cnv_1",
  size: 2048,
  author: { type: "bot", id: ana.id },
  itemId: "itm_1",
  createdAt: "2026-10-07T10:00:00.000Z",
  ...over,
});

describe("the composer's files", () => {
  it("takes files from the clip, shows them, sends them with the message and empties the box", async () => {
    const onSend = vi.fn(async () => undefined);
    render(<Composer name="Ana" onSend={onSend} />);
    const report = new File(["a,b\n1,2\n"], "report.csv", { type: "text/csv" });
    const photo = new File([new Uint8Array([1, 2, 3])], "photo.png", { type: "image/png" });
    fireEvent.change(screen.getByTestId("file-input"), { target: { files: [report, photo] } });
    const pending = screen.getByTestId("pending-files");
    expect(within(pending).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["report.csv8 B", "photo.png3 B"]);
    fireEvent.click(within(pending).getByRole("button", { name: "Take photo.png out" }));
    // Files alone are a message: send is enabled with no text.
    const send = screen.getByRole("button", { name: "Send" });
    expect((send as HTMLButtonElement).disabled).toBe(false);
    await act(async () => fireEvent.click(send));
    expect(onSend).toHaveBeenCalledWith("", [report]);
    expect(screen.queryByTestId("pending-files")).toBeNull();
  });

  it("takes a pasted screenshot and a dropped file, and refuses a file over 25 MB", async () => {
    const onSend = vi.fn(async () => undefined);
    render(<Composer name="Ana" onSend={onSend} />);
    const box = screen.getByRole("textbox");
    const shot = new File([new Uint8Array([9])], "image.png", { type: "image/png" });
    fireEvent.paste(box, { clipboardData: { files: [shot] } });
    const form = box.closest("form")!;
    fireEvent.drop(form, { dataTransfer: { files: [new File(["x"], "notes.txt", { type: "text/plain" })], types: ["Files"] } });
    const names = within(screen.getByTestId("pending-files")).getAllByRole("listitem").map((li) => li.querySelector(".pending-file-name")!.textContent);
    expect(names[0]).toMatch(/^image-\d+\.png$/);
    expect(names[1]).toBe("notes.txt");

    const huge = new File(["x"], "video.mp4", { type: "video/mp4" });
    Object.defineProperty(huge, "size", { value: 26 * 1024 * 1024 });
    fireEvent.change(screen.getByTestId("file-input"), { target: { files: [huge] } });
    expect(screen.getByTestId("send-error").textContent).toContain("video.mp4 is too large: the limit is 25 MB per file.");
    expect(within(screen.getByTestId("pending-files")).getAllByRole("listitem")).toHaveLength(2);
  });
});

describe("a message's files", () => {
  it("shows images in place and opens them large, plays audio, and gives other files a card", () => {
    const item: TimelineItem = {
      id: "itm_1",
      conversationId: "cnv_1",
      kind: "message",
      author: { type: "bot", id: ana.id },
      text: "Here is the report",
      parentId: null,
      mentions: [],
      attachments: ["fil_chartpng", "fil_notem4a", "fil_reportpdf"],
      files: [file({ name: "chart.png", mime: "image/png" }), file({ name: "note.m4a", mime: "audio/mp4" }), file({ name: "report.pdf", mime: "application/pdf", size: 1_572_864 })],
      reactions: {},
      runId: null,
      createdAt: "2026-10-07T10:00:00.000Z",
      updatedAt: "2026-10-07T10:00:00.000Z",
    };
    render(<Timeline items={[item]} bots={{ [ana.id]: ana }} runs={{}} activeRuns={[]} />);
    const shown = screen.getByTestId("attachments");
    // The token goes in the address: an <img> sends no Authorization header.
    expect(within(shown).getByRole("img", { name: "chart.png" }).getAttribute("src")).toBe("/api/v1/files/fil_chartpng/content?token=tok-1");
    expect(shown.querySelector("audio")!.getAttribute("src")).toBe("/api/v1/files/fil_notem4a/content?token=tok-1");
    const cards = within(shown).getAllByTestId("file-card").map((c) => c.textContent);
    expect(cards).toContain("PDFreport.pdf1.5 MB");
    expect(screen.getByText("Here is the report")).toBeTruthy();

    fireEvent.click(within(shown).getByRole("button", { name: "Open chart.png" }));
    const viewer = screen.getByTestId("image-viewer");
    expect(within(viewer).getByRole("img", { name: "chart.png" })).toBeTruthy();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByTestId("image-viewer")).toBeNull();
  });
});

describe("the conversation's files", () => {
  it("lists them with who sent each, images in a grid", async () => {
    const files = [
      file({ name: "chart.png", mime: "image/png" }),
      file({ name: "plan.xlsx", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", author: { type: "user", id: null } }),
    ];
    const get = vi.spyOn(api, "get").mockResolvedValue(files as never);
    render(<FilesPanel api={api} conversationId="cnv_1" bots={{ [ana.id]: ana }} onClose={() => undefined} />);
    await waitFor(() => expect(screen.getAllByTestId("file-card")).toHaveLength(1));
    expect(get).toHaveBeenCalledWith("/api/v1/conversations/cnv_1/files");
    expect(screen.getByTestId("file-card").textContent).toContain("plan.xlsx");
    expect(screen.getByText(/^You · /)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Open chart.png" })).toBeTruthy();
    get.mockRestore();
  });
});

describe("saving a file in the Android app", () => {
  it("hands the app the file's bytes, which saves them to Downloads", async () => {
    const saveFile = vi.fn();
    (window as unknown as { orbisAndroid?: unknown }).orbisAndroid = { saveText: vi.fn(), changeHub: vi.fn(), hubUrl: () => "", version: () => "1", saveFile };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(new Uint8Array([104, 105])));
    try {
      const { saveFile: save } = await import("../src/components/Files.js");
      await save(api, file({ name: "report.pdf", mime: "application/pdf" }));
      expect(fetchMock).toHaveBeenCalledWith("/api/v1/files/fil_reportpdf/content?token=tok-1&download=1");
      expect(saveFile).toHaveBeenCalledWith("report.pdf", "application/pdf", "aGk=");
    } finally {
      delete (window as unknown as { orbisAndroid?: unknown }).orbisAndroid;
      fetchMock.mockRestore();
    }
  });
});
