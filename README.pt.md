# Orbis

**Uma equipe de bots de IA persistentes, open source e auto-hospedada.** Cada
bot tem nome, cargo, regras duradouras, memória própria e computador próprio;
trabalha numa tarefa de ponta a ponta, passa trabalho para outros bots e para
pedindo sua aprovação antes de qualquer ação arriscada. Você fala com os mesmos
bots pelo **app web**, pelo **app desktop**, pela **CLI `orbis`** e pela **API
HTTP**.

O cérebro de cada bot é escolha sua, bot a bot:

| Cérebro | Como roda | Precisa de chave de API? |
|---------|-----------|--------------------------|
| `claude-code` | Claude Code CLI, headless, com o login da sua **assinatura Claude** | **Não** |
| `codex` | OpenAI Codex CLI com o seu login do **ChatGPT** | **Não** |
| `gemini-cli` | Google Gemini CLI com a sua **conta Google** | **Não** |
| `custom-cli` | qualquer comando que lê um prompt e imprime a resposta | depende |
| `anthropic` | API Messages da Anthropic | sim |
| `openai` | qualquer API compatível com OpenAI: OpenAI, OpenRouter, **Ollama**, LM Studio, vLLM | sim, exceto servidores locais |
| `mock` | determinístico, offline — para testes e demonstrações | não |

> 🇺🇸 Read in English: [README.md](README.md)

## Estado

O Orbis é construído com especificação primeiro, usando o
[Doctrina](https://github.com/GCarin1/Doctrina): o produto, 17 specs de
capacidade, os contratos de integração e as decisões de arquitetura ficam em
[`.doctrina/`](.doctrina/). Cada capacidade entra por uma change do Doctrina e só
fecha quando os critérios de aceite são provados por testes.

| Capacidade | Estado |
|------------|--------|
| Bots (identidade, regras, avatar, estado, fixar/ocultar/duplicar/apagar) | ✅ verificado |
| Conversas diretas, threads, reações, fila de execuções, stream ao vivo | ✅ |
| Cérebros: `mock`, `claude-code` (retoma a sessão), `custom-cli` | ✅ |
| Montagem de contexto (identidade, memórias, conversa recente dentro do orçamento) | ✅ |
| API REST + stream WebSocket + OpenAPI, token bearer | ✅ |
| CLI `orbis`: `serve`, `login`, `open`, `bots`, `chat` | ✅ |
| App web: roster, timeline com os passos de cada execução, pt-BR/inglês, instalável | ✅ |
| Gateway de ferramentas (MCP), aprovações e rascunhos | próximo |
| Cérebros por API, Codex, Gemini CLI, endpoint compatível com OpenAI | planejado |
| Grupos, @menções, handoff, ferramentas de memória | planejado |
| Um computador por bot (local e Docker, navegador, tela ao vivo, assumir controle) | planejado |
| Skills, rotinas, segredos, teto de gasto, templates, app desktop | planejado |

O estado de cada capacidade está sempre atualizado em `npx doctrina status` e
no cabeçalho `Implementation:` de cada spec.

## Começando

Requisitos: Node.js 22.12 ou mais novo. Para os cérebros por assinatura,
instale e faça login na CLI que você já paga (por exemplo
`npm i -g @anthropic-ai/claude-code` e depois `claude` uma vez para logar).

```bash
git clone https://github.com/GCarin1/Orbis && cd Orbis
npm install
npm run build

# sobe o hub (API + stream + app web) em http://127.0.0.1:7420
node packages/cli/dist/index.js serve
```

Em outro terminal:

```bash
alias orbis="node $(pwd)/packages/cli/dist/index.js"

orbis bots create --name "Ana" --role "QA" \
  --description "Você é a analista de QA. Nunca envie nada sem minha aprovação." \
  --brain claude-code
orbis chat @ana "Liste o que um smoke test de tela de login deve cobrir"
orbis chat @ana            # sessão interativa; o bot retoma a sessão do Claude Code
orbis open                 # abre o app web já autenticado
```

O hub guarda tudo em `~/.orbis` (`ORBIS_DATA_DIR`): o banco SQLite, o token da
API (`~/.orbis/token`) e o workspace de cada bot.

## Como as peças se encaixam

- **O hub** (`packages/hub`) cuida de bots, conversas, execuções, memória e do
  motor de execução: uma fila FIFO por bot e conversa, uma máquina de estados
  (`idle → thinking → working → waiting → blocked/done`) e eventos
  normalizados (`run.started`, `step.thinking`, `step.text`,
  `step.tool_call`, `step.tool_result`, `run.usage`, `run.finished`,
  `run.failed`), qualquer que seja o cérebro.
- **Cérebros por assinatura** rodam como processos filhos no workspace do bot
  com um ambiente limpo: nenhum token do Orbis, nenhuma chave de API e nenhum
  segredo chega até eles — a CLI cobra da sua assinatura, nunca de uma chave de
  API por acidente.
- **Os clientes** usam só a API pública documentada em
  [`docs/api.md`](docs/api.md) e em `GET /api/v1/openapi.json`.

Mais em [`docs/architecture.md`](docs/architecture.md),
[`docs/brains.md`](docs/brains.md) e [`docs/cli.md`](docs/cli.md).

## Configuração

Todas as variáveis são opcionais; veja [`.env.example`](.env.example).

| Variável | Padrão | Significado |
|----------|--------|-------------|
| `ORBIS_PORT` / `ORBIS_HOST` | `7420` / `127.0.0.1` | onde o hub escuta |
| `ORBIS_DATA_DIR` | `~/.orbis` | banco, token, workspaces |
| `ORBIS_TOKEN` | gerado em `~/.orbis/token` | token bearer da API |
| `ORBIS_MAX_BOTS` | `50` | bots por instalação |
| `ORBIS_MAX_GROUP_SIZE` | `6` | bots por grupo |
| `ORBIS_COMPUTER_PROVIDER` | `local` | `local` ou `docker` |
| `ORBIS_URL` | `http://127.0.0.1:7420` | URL do hub para a CLI |

## Desenvolvimento

```bash
npm test                      # todos os projetos do Vitest (shared, hub, cli, web, e2e)
npx vitest run --project hub  # um projeto
npx doctrina verify           # o gate: typecheck → test → build
npm run dev:web               # Vite em :5173 fazendo proxy para um hub rodando
```

O projeto e2e usa um Chromium real via Playwright; instale uma vez com
`npx playwright-core install chromium` ou aponte `ORBIS_BROWSER_EXECUTABLE`
para um binário do Chromium.

As mudanças seguem o Doctrina: `npx doctrina prime` para se orientar,
`npx doctrina work "<pedido>"` para abrir uma change, `npx doctrina close <id>`
para fechá-la. Veja o [`AGENTS.md`](AGENTS.md).

## Licença

MIT.
