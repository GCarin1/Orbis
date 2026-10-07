// specs/web-app — the MCP screen and a bot's tools (changes 0018-mcp-marketplace,
// 0048-mcp-screen-redesign): catalog cards with how each connects, search, how-it-connects
// and category filters, one-click connect, a details sheet (where it runs, whether it only
// reads) with the key form, the sign-in link, bots per server, and the switches that write a
// bot's allowlist.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { McpCatalogEntry, McpServer, ToolInfo } from "@orbis/shared";
import type { Api } from "../src/api.js";
import { Marketplace, ServerCard } from "../src/components/Marketplace.js";
import { setGroup, ToolPicker } from "../src/components/ToolPicker.js";
import { useLang } from "../src/i18n.js";
import { useStore } from "../src/store.js";
import { bot } from "./fixtures.js";

beforeEach(() => {
  act(() => useLang.getState().setLang("en"));
  act(() => useStore.setState({ mcpServers: {} }));
});

const entry = (e: Partial<McpCatalogEntry> & { id: string; name: string }): McpCatalogEntry & { connected: string | null } => ({
  icon: "🔌",
  category: "research",
  description: { en: `${e.name} in English`, "pt-BR": `${e.name} em português` },
  transport: "http",
  url: `https://${e.id}.example/mcp`,
  auth: "none",
  fields: [],
  homepage: `https://${e.id}.example`,
  connected: null,
  ...e,
});

const catalog = [
  entry({ id: "deepwiki", name: "DeepWiki", category: "dev", readOnly: true }),
  entry({ id: "notion", name: "Notion", category: "work", auth: "oauth" }),
  entry({
    id: "github",
    name: "GitHub",
    logo: "/logos/mcp/github.svg",
    category: "dev",
    auth: "token",
    fields: [
      { key: "token", label: { en: "Personal access token", "pt-BR": "Token" }, secret: true, target: "bearer", link: "https://github.com/settings/tokens" },
    ],
  }),
];

const server = (s: Partial<McpServer> & { id: string; name: string }): McpServer => ({
  icon: "🔌",
  logo: null,
  catalogId: s.id,
  transport: "http",
  url: null,
  command: null,
  args: [],
  auth: "none",
  status: "connected",
  error: null,
  authUrl: null,
  tools: [],
  bots: [],
  createdAt: "",
  updatedAt: "",
  ...s,
});

function fakeApi() {
  const post = vi.fn(async (path: string, body: { catalogId?: string }) =>
    path === "/api/v1/mcp/servers" ? server({ id: body.catalogId!, name: body.catalogId!, status: "connecting" }) : {},
  );
  const api = { get: vi.fn(async () => catalog), post, delete: vi.fn(async () => null) } as unknown as Api;
  return { api, post };
}

describe("the marketplace", () => {
  it("shows how each server connects, searches and filters, and connects one with no account in one click", async () => {
    const { api, post } = fakeApi();
    render(<Marketplace api={api} bots={[]} servers={{}} onLoad={async () => undefined} />);
    const screenEl = await screen.findByTestId("marketplace");
    await within(screenEl).findByTestId("catalog-deepwiki");
    expect(within(screen.getByTestId("catalog-deepwiki")).getByText("No account")).toBeTruthy();
    expect(within(screen.getByTestId("catalog-notion")).getByText("Sign in")).toBeTruthy();
    expect(within(screen.getByTestId("catalog-github")).getByText("Needs a key")).toBeTruthy();
    // The service's logo on a tile, or its emoji on the same tile when it has none or the image fails.
    const logo = screen.getByTestId("catalog-github").querySelector(".mcp-logo img")!;
    expect(logo.getAttribute("src")).toBe("/logos/mcp/github.svg");
    expect(screen.getByTestId("catalog-deepwiki").querySelector(".mcp-logo.emoji")!.textContent).toBe("🔌");
    fireEvent.error(logo);
    expect(screen.getByTestId("catalog-github").querySelector(".mcp-logo.emoji")!.textContent).toBe("🔌");

    // Where to start, until the user searches or filters.
    expect(screen.getByRole("heading", { name: "Start here" })).toBeTruthy();
    expect(screen.getByTestId("featured-deepwiki")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Every MCP (3)" })).toBeTruthy();

    fireEvent.change(screen.getByRole("searchbox", { name: "Search MCPs" }), { target: { value: "notion" } });
    expect(screen.queryByTestId("catalog-deepwiki")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Start here" })).toBeNull();
    expect(screen.getByRole("heading", { name: "Results: 1" })).toBeTruthy();
    fireEvent.change(screen.getByRole("searchbox", { name: "Search MCPs" }), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Work" }));
    expect(screen.getAllByTestId(/^catalog-/).map((c) => c.dataset.testid)).toEqual(["catalog-notion"]);
    fireEvent.click(screen.getByRole("button", { name: "All" }));
    // How it connects: a key.
    fireEvent.click(screen.getByRole("button", { name: "Free key" }));
    expect(screen.getAllByTestId(/^catalog-/).map((c) => c.dataset.testid)).toEqual(["catalog-github"]);
    fireEvent.click(screen.getByRole("button", { name: "Sign-in" }));
    fireEvent.click(screen.getByRole("button", { name: "Development" }));
    expect(screen.getByText("No MCP matches.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(screen.getAllByTestId(/^catalog-/)).toHaveLength(3);

    await act(async () => fireEvent.click(within(screen.getByTestId("catalog-deepwiki")).getByRole("button", { name: "Connect" })));
    expect(post).toHaveBeenCalledWith("/api/v1/mcp/servers", { catalogId: "deepwiki", values: {} });
    expect(screen.getByRole("tab", { name: /Connected/ }).getAttribute("aria-selected")).toBe("true");
  });

  it("opens a server's details: how it connects, where it runs, whether it only reads; Esc closes them", async () => {
    const { api } = fakeApi();
    render(<Marketplace api={api} bots={[]} servers={{}} onLoad={async () => undefined} />);
    fireEvent.click(within(await screen.findByTestId("catalog-deepwiki")).getByRole("button", { name: "DeepWiki" }));
    const sheet = screen.getByRole("dialog", { name: "DeepWiki" });
    expect(within(sheet).getByText("No account: it connects in one click.")).toBeTruthy();
    expect(within(sheet).getByText("https://deepwiki.example/mcp")).toBeTruthy();
    expect(within(sheet).getByText("Reads only: its tools run without asking.")).toBeTruthy();
    expect(within(sheet).getByText("Only the bots you tick, once it is connected.")).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();

    // A card's whole area opens it too; a server that changes things says it asks first.
    fireEvent.click(screen.getByTestId("catalog-notion"));
    expect(within(screen.getByRole("dialog", { name: "Notion" })).getByText(/Reads and changes: whatever changes something asks/)).toBeTruthy();
    expect(within(screen.getByRole("dialog", { name: "Notion" })).getByRole("button", { name: "Connect with your account" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("says a server that signs in with a code does so, and lists it under Sign-in (change 0057)", async () => {
    const onedrive = entry({ id: "onedrive", name: "OneDrive", category: "files", transport: "stdio", url: undefined, command: "npx", args: ["-y", "@softeria/ms-365-mcp-server"], auth: "device" });
    const api = { get: vi.fn(async () => [...catalog, onedrive]), post: vi.fn(), delete: vi.fn() } as unknown as Api;
    render(<Marketplace api={api} bots={[]} servers={{}} onLoad={async () => undefined} />);
    const card = await screen.findByTestId("catalog-onedrive");
    expect(within(card).getByText("Sign in with a code")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Sign-in" }));
    expect(screen.getAllByTestId(/^catalog-/).map((c) => c.dataset.testid)).toEqual(["catalog-notion", "catalog-onedrive"]);
    fireEvent.click(screen.getByTestId("catalog-onedrive"));
    const sheet = screen.getByRole("dialog", { name: "OneDrive" });
    expect(within(sheet).getByText(/ask a bot to sign in\. It gets a code for you to type on the service's page/)).toBeTruthy();
    // Connecting starts the program; the sign-in happens afterwards, through a bot.
    expect(within(sheet).getByRole("button", { name: "Connect" })).toBeTruthy();
  });

  it("asks for the key of a server that needs one in its details, with where to get it", async () => {
    const { api, post } = fakeApi();
    render(<Marketplace api={api} bots={[]} servers={{}} onLoad={async () => undefined} />);
    const card = await screen.findByTestId("catalog-github");
    fireEvent.click(within(card).getByRole("button", { name: "Connect" }));
    expect(post).not.toHaveBeenCalled();
    const sheet = screen.getByTestId("details-github");
    expect(within(sheet).getByRole("link", { name: "Where to get it" }).getAttribute("href")).toBe("https://github.com/settings/tokens");
    const input = within(sheet).getByLabelText(/Personal access token/) as HTMLInputElement;
    expect(input.type).toBe("password");
    fireEvent.change(input, { target: { value: "github_pat_123" } });
    await act(async () => fireEvent.click(within(sheet).getByRole("button", { name: "Connect" })));
    expect(post).toHaveBeenCalledWith("/api/v1/mcp/servers", { catalogId: "github", values: { token: "github_pat_123" } });
    expect(screen.queryByTestId("details-github")).toBeNull();
    expect(screen.getByRole("tab", { name: /Connected/ }).getAttribute("aria-selected")).toBe("true");
  });

  it("says when nothing is connected, and sums up what is", async () => {
    const { api } = fakeApi();
    const ana = bot({ name: "Ana" });
    const { rerender } = render(<Marketplace api={api} bots={[ana]} servers={{}} onLoad={async () => undefined} />);
    fireEvent.click(screen.getByRole("tab", { name: /Connected/ }));
    expect(screen.getByRole("heading", { name: "No MCP connected yet" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Explore the catalog" }));
    expect(screen.getByRole("tab", { name: /Explore/ }).getAttribute("aria-selected")).toBe("true");
    const notion = server({
      id: "notion",
      name: "Notion",
      bots: [ana.id],
      tools: [{ name: "mcp.notion.search", remoteName: "search", description: "", readOnly: true }],
    });
    rerender(<Marketplace api={api} bots={[ana]} servers={{ notion }} onLoad={async () => undefined} />);
    fireEvent.click(screen.getByRole("tab", { name: /Connected/ }));
    expect(screen.getByText("Connected: 1 · tools: 1 · bots with access: 1")).toBeTruthy();
    expect(screen.getByLabelText("Bots with access: 1")).toBeTruthy();
    // The catalog card of a connected server says so instead of offering to connect.
    fireEvent.click(screen.getByRole("tab", { name: /Explore/ }));
    expect(within(await screen.findByTestId("catalog-notion")).getByText("Connected")).toBeTruthy();
    expect(within(screen.getByTestId("catalog-notion")).queryByRole("button", { name: "Connect" })).toBeNull();
  });

  it("sends the user to sign in, and gives a connected server's tools to the bots ticked", async () => {
    const { api, post } = fakeApi();
    const ana = bot({ name: "Ana" });
    const { rerender } = render(
      <ServerCard
        api={api}
        bots={[ana]}
        server={server({ id: "notion", name: "Notion", auth: "oauth", status: "needs_auth", authUrl: "https://mcp.notion.com/authorize?x=1" })}
      />,
    );
    const link = screen.getByRole("link", { name: "Sign in to Notion" });
    expect(link.getAttribute("href")).toBe("https://mcp.notion.com/authorize?x=1");
    expect(link.getAttribute("target")).toBe("_blank");

    rerender(
      <ServerCard
        api={api}
        bots={[ana]}
        server={server({
          id: "notion",
          name: "Notion",
          logo: "/logos/mcp/notion.svg",
          tools: [
            { name: "mcp.notion.search", remoteName: "search", description: "Search pages", readOnly: true },
            { name: "mcp.notion.create_page", remoteName: "create_page", description: "Create a page", readOnly: false },
          ],
        })}
      />,
    );
    expect(screen.getByTestId("server-notion").textContent).toContain("Connected · 2 tools");
    expect(screen.getByTestId("server-notion").querySelector(".mcp-logo img")!.getAttribute("src")).toBe("/logos/mcp/notion.svg");
    expect(screen.getByText("1 read only · 1 ask first")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /See the 2 tools/ }));
    expect(screen.getByText("reads only")).toBeTruthy();
    expect(screen.getByText("asks first")).toBeTruthy();
    await act(async () => fireEvent.click(screen.getByRole("checkbox", { name: /Ana/ })));
    expect(post).toHaveBeenCalledWith("/api/v1/mcp/servers/notion/bots", { botId: ana.id, enabled: true });
    // Reconnect and disconnect wait in the ⋮ menu.
    fireEvent.click(screen.getByRole("button", { name: "Notion options" }));
    await act(async () => fireEvent.click(screen.getByRole("menuitem", { name: /Reconnect/ })));
    expect(post).toHaveBeenCalledWith("/api/v1/mcp/servers/notion/reconnect");
  });

  it("says which bots it tells about its updates, while any do (change 0061)", () => {
    const { api } = fakeApi();
    const ana = bot({ name: "Ana" });
    const bia = bot({ name: "Bia" });
    const { rerender } = render(<ServerCard api={api} bots={[ana, bia]} server={server({ id: "shop", name: "Shop", bots: [ana.id, bia.id], watchers: [] })} />);
    expect(screen.queryByTestId("mcp-watchers")).toBeNull();
    rerender(<ServerCard api={api} bots={[ana, bia]} server={server({ id: "shop", name: "Shop", bots: [ana.id, bia.id], watchers: [ana.id, bia.id] })} />);
    expect(screen.getByTestId("mcp-watchers").textContent).toBe("🔔 Stays connected and tells Ana, Bia what it announces (initiative → MCP servers' updates).");
  });
});

describe("a bot's tools", () => {
  const tools: ToolInfo[] = [
    { name: "computer.shell", description: "", risk: "write", server: null },
    { name: "computer.read_file", description: "", risk: "read", server: null },
    { name: "browser.open", description: "", risk: "external", server: null },
    { name: "mcp.notion.search", description: "", risk: "read", server: "notion" },
  ];

  it("writes the allowlist from switches: groups off with !, servers on with mcp.<server>.*", async () => {
    act(() => useStore.setState({ mcpServers: { notion: server({ id: "notion", name: "Notion", icon: "📝" }) } }));
    const onChange = vi.fn();
    const api = { get: vi.fn(async () => tools) } as unknown as Api;
    const { rerender } = render(<ToolPicker api={api} patterns={["*"]} onChange={onChange} />);
    const browser = (await screen.findByTestId("tool-group-browser")).querySelector("input")!;
    expect(browser.checked).toBe(true);
    const notion = screen.getByTestId("tool-group-mcp.notion");
    expect(notion.textContent).toContain("Notion");
    // With no logo for the server, its emoji stands in, on the same tile a logo has.
    expect(notion.querySelector(".mcp-logo")!.textContent).toBe("📝");
    expect(notion.querySelector("input")!.checked).toBe(false);

    fireEvent.click(browser);
    expect(onChange).toHaveBeenLastCalledWith(["*", "!browser.*"]);
    fireEvent.click(notion.querySelector("input")!);
    expect(onChange).toHaveBeenLastCalledWith(["*", "mcp.notion.*"]);

    rerender(<ToolPicker api={api} patterns={["computer.read_file"]} onChange={onChange} />);
    await waitFor(() => expect((screen.getByTestId("tool-group-computer").querySelector("input") as HTMLInputElement).indeterminate).toBe(true));
  });

  it("keeps every other pattern and spells an empty choice as !*", () => {
    const computer = { prefix: "computer.", external: false, names: ["computer.shell", "computer.read_file"] };
    const notion = { prefix: "mcp.notion.", external: true, names: ["mcp.notion.search"] };
    expect(setGroup(["computer.*"], computer, false)).toEqual(["!*"]);
    expect(setGroup(["*", "!computer.*"], computer, true)).toEqual(["*"]);
    expect(setGroup(["computer.shell"], computer, true)).toEqual(["computer.*"]);
    expect(setGroup(["*", "mcp.notion.*"], notion, false)).toEqual(["*"]);
    expect(setGroup(["!*"], notion, true)).toEqual(["mcp.notion.*"]);
  });
});
