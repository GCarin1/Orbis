// pt-BR and English texts (specs/web-app: follows the browser, manual switch remembered).
import { create } from "zustand";

export type Lang = "pt-BR" | "en";

const pt = {
  "app.tagline": "Sua equipe de bots de IA persistentes",
  "token.title": "Conectar ao hub",
  "token.help": "Cole o token da API. Ele fica em ~/.orbis/token no computador que roda o hub (ou use `orbis open`).",
  "token.placeholder": "token da API",
  "token.submit": "Conectar",
  "token.invalid": "Token inválido ou hub inacessível.",
  "roster.title": "Bots",
  "roster.new": "Novo bot",
  "roster.pinned": "Fixados",
  "roster.noRole": "Sem cargo",
  "roster.empty": "Nenhum bot ainda. Crie o primeiro.",
  "state.idle": "Ocioso",
  "state.thinking": "Pensando",
  "state.working": "Trabalhando",
  "state.waiting": "Aguardando você",
  "state.blocked": "Bloqueado",
  "state.done": "Concluído",
  "conv.empty": "Escolha um bot na barra lateral para conversar.",
  "conv.start": "Diga olá para {name}. A descrição dele guarda as regras duradouras; a mensagem guarda a tarefa do momento.",
  "composer.placeholder": "Mensagem para {name} — Enter envia, Shift+Enter quebra a linha",
  "composer.send": "Enviar",
  "steps.show": "Ver {count} passos",
  "steps.hide": "Ocultar passos",
  "steps.running": "{name} está trabalhando…",
  "you": "Você",
  "newbot.title": "Novo bot",
  "newbot.name": "Nome",
  "newbot.role": "Cargo",
  "newbot.description": "Descrição e regras duradouras",
  "newbot.descriptionHint": "Ex.: Você é a analista de QA. Nunca envie nada sem minha aprovação.",
  "newbot.brain": "Cérebro",
  "newbot.model": "Modelo (opcional)",
  "newbot.command": "Comando",
  "newbot.baseUrl": "URL base (opcional; Ollama: http://localhost:11434/v1)",
  "newbot.create": "Criar bot",
  "newbot.cancel": "Cancelar",
  "brain.claude-code": "Claude Code (assinatura, sem API)",
  "brain.codex": "Codex CLI (assinatura, sem API)",
  "brain.gemini-cli": "Gemini CLI (conta Google, sem API)",
  "brain.anthropic": "API Anthropic",
  "brain.openai": "API compatível com OpenAI (OpenAI, Ollama, OpenRouter…)",
  "brain.custom-cli": "Comando próprio",
  "brain.mock": "Mock (testes, sem IA)",
  "lang.label": "Idioma",
  "stream.offline": "Reconectando ao hub…",
  "error.generic": "Algo deu errado: {message}",
  "approval.asks": "{name} quer usar {tool}",
  "approval.reason": "Motivo: {reason}",
  "approval.locked": "Regra travada: sempre pergunta",
  "approval.once": "Permitir uma vez",
  "approval.always": "Sempre permitir",
  "approval.deny": "Negar",
  "approval.notePlaceholder": "Nota para o bot (opcional)",
  "approval.state.pending": "Aguardando você",
  "approval.state.approved": "Aprovado",
  "approval.state.denied": "Negado",
  "approval.state.expired": "Expirou",
  "draft.title": "{name} preparou um rascunho ({channel})",
  "draft.to": "Para",
  "draft.subject": "Assunto",
  "draft.body": "Mensagem",
  "draft.url": "URL do webhook",
  "draft.send": "Enviar",
  "draft.discard": "Descartar",
  "draft.state.pending": "Rascunho — nada foi enviado",
  "draft.state.sent": "Enviado",
  "draft.state.discarded": "Descartado",
  "draft.state.failed": "Falhou — revise e envie de novo",
  "inbox.title": "Aguardando você",
  "inbox.empty": "Nada esperando por você.",
  "inbox.open": "Abrir conversa",
  "groups.title": "Grupos",
  "groups.new": "Novo grupo",
  "groups.empty": "Junte de 2 a 6 bots num grupo para trabalharem juntos.",
  "groups.members": "{count} bots",
  "groups.lead": "líder",
  "newgroup.title": "Novo grupo",
  "newgroup.name": "Nome do grupo",
  "newgroup.members": "Membros (de 2 a 6 bots)",
  "newgroup.lead": "Líder — responde quando ninguém é mencionado",
  "newgroup.create": "Criar grupo",
  "newgroup.count": "{count} de 6 escolhidos",
  "conv.startGroup": "Mencione um bot com @, use @everyone para todos, ou só escreva: {lead} (líder) responde.",
  "composer.mentions": "Mencionar",
  "mention.everyone": "todos os membros do grupo",
  "handoff.title": "{from} passou uma tarefa para {to}",
  "handoff.context": "Contexto",
  "handoff.returns": "A resposta volta para {from}.",
  "handoff.state.queued": "Na fila",
  "handoff.state.running": "Em andamento",
  "handoff.state.done": "Concluída",
  "handoff.state.failed": "Falhou",
  "thread.replyTo": "em resposta a {text}",
};

export type TextKey = keyof typeof pt;

const en: Record<TextKey, string> = {
  "app.tagline": "Your team of persistent AI bots",
  "token.title": "Connect to the hub",
  "token.help": "Paste the API token. It lives in ~/.orbis/token on the machine running the hub (or use `orbis open`).",
  "token.placeholder": "API token",
  "token.submit": "Connect",
  "token.invalid": "Invalid token or unreachable hub.",
  "roster.title": "Bots",
  "roster.new": "New bot",
  "roster.pinned": "Pinned",
  "roster.noRole": "No role",
  "roster.empty": "No bots yet. Create the first one.",
  "state.idle": "Idle",
  "state.thinking": "Thinking",
  "state.working": "Working",
  "state.waiting": "Waiting for you",
  "state.blocked": "Blocked",
  "state.done": "Done",
  "conv.empty": "Pick a bot in the sidebar to start talking.",
  "conv.start": "Say hello to {name}. Its description holds the durable rules; your message holds the task of the moment.",
  "composer.placeholder": "Message {name} — Enter sends, Shift+Enter adds a line",
  "composer.send": "Send",
  "steps.show": "Show {count} steps",
  "steps.hide": "Hide steps",
  "steps.running": "{name} is working…",
  "you": "You",
  "newbot.title": "New bot",
  "newbot.name": "Name",
  "newbot.role": "Role",
  "newbot.description": "Description and durable rules",
  "newbot.descriptionHint": "E.g.: You are the QA analyst. Never send anything without my approval.",
  "newbot.brain": "Brain",
  "newbot.model": "Model (optional)",
  "newbot.command": "Command",
  "newbot.baseUrl": "Base URL (optional; Ollama: http://localhost:11434/v1)",
  "newbot.create": "Create bot",
  "newbot.cancel": "Cancel",
  "brain.claude-code": "Claude Code (subscription, no API)",
  "brain.codex": "Codex CLI (subscription, no API)",
  "brain.gemini-cli": "Gemini CLI (Google account, no API)",
  "brain.anthropic": "Anthropic API",
  "brain.openai": "OpenAI-compatible API (OpenAI, Ollama, OpenRouter…)",
  "brain.custom-cli": "Your own command",
  "brain.mock": "Mock (tests, no AI)",
  "lang.label": "Language",
  "stream.offline": "Reconnecting to the hub…",
  "error.generic": "Something went wrong: {message}",
  "approval.asks": "{name} wants to use {tool}",
  "approval.reason": "Reason: {reason}",
  "approval.locked": "Locked rule: always asks",
  "approval.once": "Allow once",
  "approval.always": "Always allow",
  "approval.deny": "Deny",
  "approval.notePlaceholder": "Note for the bot (optional)",
  "approval.state.pending": "Waiting for you",
  "approval.state.approved": "Approved",
  "approval.state.denied": "Denied",
  "approval.state.expired": "Expired",
  "draft.title": "{name} prepared a draft ({channel})",
  "draft.to": "To",
  "draft.subject": "Subject",
  "draft.body": "Message",
  "draft.url": "Webhook URL",
  "draft.send": "Send",
  "draft.discard": "Discard",
  "draft.state.pending": "Draft — nothing was sent",
  "draft.state.sent": "Sent",
  "draft.state.discarded": "Discarded",
  "draft.state.failed": "Failed — review and send again",
  "inbox.title": "Waiting for you",
  "inbox.empty": "Nothing is waiting for you.",
  "inbox.open": "Open conversation",
  "groups.title": "Groups",
  "groups.new": "New group",
  "groups.empty": "Put 2 to 6 bots in a group to work together.",
  "groups.members": "{count} bots",
  "groups.lead": "lead",
  "newgroup.title": "New group",
  "newgroup.name": "Group name",
  "newgroup.members": "Members (2 to 6 bots)",
  "newgroup.lead": "Lead — answers when nobody is mentioned",
  "newgroup.create": "Create group",
  "newgroup.count": "{count} of 6 chosen",
  "conv.startGroup": "Mention a bot with @, use @everyone for all, or just write: {lead} (lead) answers.",
  "composer.mentions": "Mention",
  "mention.everyone": "every member of the group",
  "handoff.title": "{from} handed a task to {to}",
  "handoff.context": "Context",
  "handoff.returns": "The answer goes back to {from}.",
  "handoff.state.queued": "Queued",
  "handoff.state.running": "In progress",
  "handoff.state.done": "Done",
  "handoff.state.failed": "Failed",
  "thread.replyTo": "replying to {text}",
};

const TEXTS: Record<Lang, Record<TextKey, string>> = { "pt-BR": pt, en };
const STORAGE_KEY = "orbis.lang";

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "pt-BR" || saved === "en") return saved;
  } catch {
    /* storage unavailable */
  }
  const nav = typeof navigator !== "undefined" ? navigator.language : "en";
  return nav.toLowerCase().startsWith("pt") ? "pt-BR" : "en";
}

interface LangState {
  lang: Lang;
  setLang(lang: Lang): void;
}

export const useLang = create<LangState>((set) => ({
  lang: initialLang(),
  setLang(lang) {
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      /* storage unavailable */
    }
    document.documentElement.lang = lang;
    set({ lang });
  },
}));

export function translate(lang: Lang, key: TextKey, vars: Record<string, string | number> = {}): string {
  return TEXTS[lang][key].replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name] ?? `{${name}}`));
}

export function useT() {
  const lang = useLang((s) => s.lang);
  return (key: TextKey, vars?: Record<string, string | number>) => translate(lang, key, vars);
}
