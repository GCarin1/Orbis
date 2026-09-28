// The MCP marketplace (specs/tool-gateway): servers Orbis knows how to connect
// in one click. Every npm package and endpoint here was checked to exist when
// it was added (npm registry, live endpoint answering `initialize`, OAuth
// servers publishing dynamic client registration).
import type { McpCatalogEntry } from "@orbis/shared";

const NODE = "Node.js (npx)";

export interface CatalogEntry extends McpCatalogEntry {
  /** Tools of this server only read: they run without asking, unless a rule says otherwise. */
  readOnly?: boolean;
}

export const MCP_CATALOG: CatalogEntry[] = [
  // --- no account -------------------------------------------------------------------------
  {
    id: "deepwiki",
    name: "DeepWiki",
    icon: "📚",
    category: "dev",
    description: {
      en: "Documentation and answers about any public GitHub repository. No account.",
      "pt-BR": "Documentação e respostas sobre qualquer repositório público do GitHub. Sem conta.",
    },
    transport: "http",
    url: "https://mcp.deepwiki.com/mcp",
    auth: "none",
    fields: [],
    homepage: "https://deepwiki.com",
    readOnly: true,
  },
  {
    id: "exa",
    name: "Exa Search",
    icon: "🔎",
    category: "research",
    description: {
      en: "Web search and the text of pages, for research with sources. No account (with limits).",
      "pt-BR": "Busca na web e o texto das páginas, para pesquisar com fontes. Sem conta (com limites).",
    },
    transport: "http",
    url: "https://mcp.exa.ai/mcp",
    auth: "none",
    fields: [],
    homepage: "https://exa.ai",
    readOnly: true,
  },
  {
    id: "context7",
    name: "Context7",
    icon: "📖",
    category: "dev",
    description: {
      en: "Up-to-date documentation and code examples of libraries and frameworks. No account.",
      "pt-BR": "Documentação atualizada e exemplos de código de bibliotecas e frameworks. Sem conta.",
    },
    transport: "http",
    url: "https://mcp.context7.com/mcp",
    auth: "none",
    fields: [],
    homepage: "https://context7.com",
    readOnly: true,
  },
  {
    id: "huggingface",
    name: "Hugging Face",
    icon: "🤗",
    category: "research",
    description: {
      en: "Search models, datasets, Spaces and papers on Hugging Face. A token is optional.",
      "pt-BR": "Busque modelos, datasets, Spaces e artigos no Hugging Face. O token é opcional.",
    },
    transport: "http",
    url: "https://huggingface.co/mcp",
    auth: "none",
    fields: [
      {
        key: "token",
        label: { en: "Access token (optional)", "pt-BR": "Token de acesso (opcional)" },
        secret: true,
        target: "bearer",
        placeholder: "hf_…",
        link: "https://huggingface.co/settings/tokens",
        optional: true,
      },
    ],
    homepage: "https://huggingface.co/settings/mcp",
    readOnly: true,
  },
  {
    id: "sequential-thinking",
    name: "Sequential Thinking",
    icon: "🧠",
    category: "reasoning",
    description: {
      en: "A scratchpad for thinking a problem through step by step, revising and branching.",
      "pt-BR": "Um rascunho para pensar um problema passo a passo, revisando e ramificando.",
    },
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-sequential-thinking"],
    auth: "none",
    fields: [],
    homepage: "https://github.com/modelcontextprotocol/servers/tree/main/src/sequentialthinking",
    needs: NODE,
    readOnly: true,
  },
  {
    id: "playwright",
    name: "Playwright Browser",
    icon: "🎭",
    category: "browser",
    description: {
      en: "A browser window the bot drives by the page's structure: click, type, fill forms, take screenshots.",
      "pt-BR": "Uma janela de navegador que o bot controla pela estrutura da página: clicar, digitar, preencher formulários, capturar a tela.",
    },
    transport: "stdio",
    command: "npx",
    args: ["-y", "@playwright/mcp@latest"],
    auth: "none",
    fields: [],
    homepage: "https://github.com/microsoft/playwright-mcp",
    needs: NODE,
  },
  {
    id: "filesystem",
    name: "Filesystem",
    icon: "🗂️",
    category: "files",
    description: {
      en: "Read, write, search and move files inside one folder of this computer that you choose.",
      "pt-BR": "Ler, gravar, buscar e mover arquivos dentro de uma pasta deste computador que você escolhe.",
    },
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-filesystem"],
    auth: "none",
    fields: [
      {
        key: "folder",
        label: { en: "Folder it may use (full path)", "pt-BR": "Pasta que ele pode usar (caminho completo)" },
        secret: false,
        target: "arg",
        placeholder: "C:\\Users\\you\\Documents",
      },
    ],
    homepage: "https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem",
    needs: NODE,
  },

  // --- sign in with your account ---------------------------------------------------------------
  {
    id: "notion",
    name: "Notion",
    icon: "📝",
    category: "work",
    description: {
      en: "Search, read, create and update pages and databases in your Notion workspace.",
      "pt-BR": "Buscar, ler, criar e atualizar páginas e bancos de dados do seu Notion.",
    },
    transport: "http",
    url: "https://mcp.notion.com/mcp",
    auth: "oauth",
    fields: [],
    homepage: "https://developers.notion.com/docs/mcp",
  },
  {
    id: "linear",
    name: "Linear",
    icon: "📐",
    category: "work",
    description: {
      en: "Find, create and update issues, projects and comments in Linear.",
      "pt-BR": "Encontrar, criar e atualizar issues, projetos e comentários no Linear.",
    },
    transport: "http",
    url: "https://mcp.linear.app/mcp",
    auth: "oauth",
    fields: [],
    homepage: "https://linear.app/docs/mcp",
  },
  {
    id: "atlassian",
    name: "Jira & Confluence",
    icon: "🧭",
    category: "work",
    description: {
      en: "Jira issues and Confluence pages of your Atlassian site: search, create, update, comment.",
      "pt-BR": "Issues do Jira e páginas do Confluence do seu site Atlassian: buscar, criar, atualizar, comentar.",
    },
    transport: "http",
    url: "https://mcp.atlassian.com/v1/mcp",
    auth: "oauth",
    fields: [],
    homepage: "https://support.atlassian.com/rovo/docs/getting-started-with-the-atlassian-remote-mcp-server/",
  },
  {
    id: "sentry",
    name: "Sentry",
    icon: "🐞",
    category: "dev",
    description: {
      en: "Errors, issues and releases of your Sentry projects, with stack traces.",
      "pt-BR": "Erros, issues e releases dos seus projetos no Sentry, com stack traces.",
    },
    transport: "http",
    url: "https://mcp.sentry.dev/mcp",
    auth: "oauth",
    fields: [],
    homepage: "https://docs.sentry.io/product/sentry-mcp/",
  },
  {
    id: "supabase",
    name: "Supabase",
    icon: "🟢",
    category: "dev",
    description: {
      en: "Your Supabase projects: tables, SQL, migrations, logs and edge functions.",
      "pt-BR": "Seus projetos Supabase: tabelas, SQL, migrations, logs e edge functions.",
    },
    transport: "http",
    url: "https://mcp.supabase.com/mcp",
    auth: "oauth",
    fields: [],
    homepage: "https://supabase.com/docs/guides/getting-started/mcp",
  },
  {
    id: "canva",
    name: "Canva",
    icon: "🎨",
    category: "work",
    description: {
      en: "Find, create and export designs in your Canva account.",
      "pt-BR": "Encontrar, criar e exportar designs da sua conta Canva.",
    },
    transport: "http",
    url: "https://mcp.canva.com/mcp",
    auth: "oauth",
    fields: [],
    homepage: "https://www.canva.dev/docs/mcp/",
  },

  // --- a key or token ----------------------------------------------------------------------------
  {
    id: "github",
    name: "GitHub",
    icon: "🐙",
    category: "dev",
    description: {
      en: "Repositories, issues, pull requests, code search and Actions, with your personal access token.",
      "pt-BR": "Repositórios, issues, pull requests, busca de código e Actions, com o seu token de acesso pessoal.",
    },
    transport: "http",
    url: "https://api.githubcopilot.com/mcp/",
    auth: "token",
    fields: [
      {
        key: "token",
        label: { en: "Personal access token", "pt-BR": "Token de acesso pessoal" },
        secret: true,
        target: "bearer",
        placeholder: "github_pat_…",
        help: {
          en: "Create a fine-grained token with access to the repositories the bots may use.",
          "pt-BR": "Crie um token fine-grained com acesso aos repositórios que os bots podem usar.",
        },
        link: "https://github.com/settings/personal-access-tokens/new",
      },
    ],
    homepage: "https://github.com/github/github-mcp-server",
  },
  {
    id: "brave-search",
    name: "Brave Search",
    icon: "🦁",
    category: "research",
    description: {
      en: "Web, news, image and local search with the Brave Search API (free plan available).",
      "pt-BR": "Busca na web, notícias, imagens e locais com a API do Brave Search (tem plano gratuito).",
    },
    transport: "stdio",
    command: "npx",
    args: ["-y", "@brave/brave-search-mcp-server"],
    auth: "token",
    fields: [
      {
        key: "BRAVE_API_KEY",
        label: { en: "Brave Search API key", "pt-BR": "Chave da API do Brave Search" },
        secret: true,
        target: "env",
        link: "https://brave.com/search/api/",
      },
    ],
    homepage: "https://github.com/brave/brave-search-mcp-server",
    needs: NODE,
    readOnly: true,
  },
  {
    id: "tavily",
    name: "Tavily",
    icon: "🛰️",
    category: "research",
    description: {
      en: "Search built for AI agents, and the extracted content of pages (free credits every month).",
      "pt-BR": "Busca feita para agentes de IA e o conteúdo extraído das páginas (créditos grátis todo mês).",
    },
    transport: "stdio",
    command: "npx",
    args: ["-y", "tavily-mcp"],
    auth: "token",
    fields: [
      {
        key: "TAVILY_API_KEY",
        label: { en: "Tavily API key", "pt-BR": "Chave da API da Tavily" },
        secret: true,
        target: "env",
        placeholder: "tvly-…",
        link: "https://app.tavily.com",
      },
    ],
    homepage: "https://github.com/tavily-ai/tavily-mcp",
    needs: NODE,
    readOnly: true,
  },
  {
    id: "firecrawl",
    name: "Firecrawl",
    icon: "🔥",
    category: "research",
    description: {
      en: "Scrape and crawl websites into clean text, including pages that need a browser.",
      "pt-BR": "Extrair e percorrer sites em texto limpo, inclusive páginas que precisam de navegador.",
    },
    transport: "stdio",
    command: "npx",
    args: ["-y", "firecrawl-mcp"],
    auth: "token",
    fields: [
      {
        key: "FIRECRAWL_API_KEY",
        label: { en: "Firecrawl API key", "pt-BR": "Chave da API do Firecrawl" },
        secret: true,
        target: "env",
        placeholder: "fc-…",
        link: "https://www.firecrawl.dev/app/api-keys",
      },
    ],
    homepage: "https://github.com/firecrawl/firecrawl-mcp-server",
    needs: NODE,
    readOnly: true,
  },
];

export function catalogEntry(id: string): CatalogEntry | undefined {
  return MCP_CATALOG.find((e) => e.id === id);
}
