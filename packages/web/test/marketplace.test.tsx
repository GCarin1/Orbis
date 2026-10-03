// specs/web-app — the tools marketplace and a bot's tools (change
// 0018-mcp-marketplace): catalog cards with how each connects, search and
// categories, one-click connect, a key form, the sign-in link, bots per
// server, and the switches that write a bot's allowlist.
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
  entry({ id: "deepwiki", name: "DeepWiki", category: "dev" }),
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

    fireEvent.change(screen.getByRole("searchbox", { name: "Search MCPs" }), { target: { value: "notion" } });
    expect(screen.queryByTestId("catalog-deepwiki")).toBeNull();
    fireEvent.change(screen.getByRole("searchbox", { name: "Search MCPs" }), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Work" }));
    expect(screen.getAllByTestId(/^catalog-/).map((c) => c.dataset.testid)).toEqual(["catalog-notion"]);
    fireEvent.click(screen.getByRole("button", { name: "All" }));

    await act(async () => fireEvent.click(within(screen.getByTestId("catalog-deepwiki")).getByRole("button", { name: "Connect" })));
    expect(post).toHaveBeenCalledWith("/api/v1/mcp/servers", { catalogId: "deepwiki", values: {} });
    expect(screen.getByRole("tab", { name: /Connected/ }).getAttribute("aria-selected")).toBe("true");
  });

  it("asks for the key of a server that needs one, with where to get it", async () => {
    const { api, post } = fakeApi();
    render(<Marketplace api={api} bots={[]} servers={{}} onLoad={async () => undefined} />);
    const card = await screen.findByTestId("catalog-github");
    fireEvent.click(within(card).getByRole("button", { name: "Connect" }));
    expect(within(card).getByRole("link", { name: "Where to get it" }).getAttribute("href")).toBe("https://github.com/settings/tokens");
    const input = within(card).getByLabelText(/Personal access token/) as HTMLInputElement;
    expect(input.type).toBe("password");
    fireEvent.change(input, { target: { value: "github_pat_123" } });
    await act(async () => fireEvent.click(within(card).getByRole("button", { name: "Connect" })));
    expect(post).toHaveBeenCalledWith("/api/v1/mcp/servers", { catalogId: "github", values: { token: "github_pat_123" } });
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
    fireEvent.click(screen.getByRole("button", { name: "See the 2 tools" }));
    expect(screen.getByText("reads only")).toBeTruthy();
    expect(screen.getByText("asks first")).toBeTruthy();
    await act(async () => fireEvent.click(screen.getByRole("checkbox", { name: /Ana/ })));
    expect(post).toHaveBeenCalledWith("/api/v1/mcp/servers/notion/bots", { botId: ana.id, enabled: true });
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
