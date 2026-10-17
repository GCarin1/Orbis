// How a conversation talks (specs/conversations, change 0082-backstage): its bots answer the user short and
// human ("chat") or in full ("detailed"), and the team's work — the handoffs, the answers coming back to whoever
// handed the work out, and that bot's own words while it waits for them — stays backstage, where the user opens
// it if they want. What needs the user (approvals, secrets, files, a failure of the bot they talk to) and the
// final answer always show in the chat. Each conversation chooses, or follows the hub's default.
import type { FastifyInstance } from "fastify";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import Type from "typebox";
import type { Bot, ConversationDefaults, ReplyStyle, Run } from "@orbis/shared";
import type { HubContext } from "../context.js";
import { run as exec } from "../db/index.js";
import { SettingsRepo } from "../repos/settings.js";

const DEFAULTS_KEY = "conversation.defaults";
/** A new conversation's way when nothing was chosen: short and human, the team's work backstage. */
export const HUB_DEFAULTS: ConversationDefaults = { replyStyle: "chat", backstage: true };

export class ConversationStyle {
  private readonly settings: SettingsRepo;

  constructor(private readonly hub: HubContext) {
    this.settings = new SettingsRepo(hub.db);
  }

  defaults(): ConversationDefaults {
    try {
      const saved = JSON.parse(this.settings.get(DEFAULTS_KEY) ?? "null") as Partial<ConversationDefaults> | null;
      return {
        replyStyle: saved?.replyStyle === "detailed" || saved?.replyStyle === "chat" ? saved.replyStyle : HUB_DEFAULTS.replyStyle,
        backstage: typeof saved?.backstage === "boolean" ? saved.backstage : HUB_DEFAULTS.backstage,
      };
    } catch {
      return { ...HUB_DEFAULTS };
    }
  }

  /** The way a conversation talks: its own choice, else the hub's default. */
  of(conversationId: string | null): ConversationDefaults {
    const fallback = this.defaults();
    const conv = conversationId ? this.hub.repos.conversations.get(conversationId) : undefined;
    if (!conv) return fallback;
    return { replyStyle: conv.replyStyle ?? fallback.replyStyle, backstage: conv.backstage ?? fallback.backstage };
  }

  /**
   * Whether what a run posts stays backstage: a handed-off task's own work, and the words of a bot that handed
   * work out and waits for the answers (its report follows, in the chat).
   */
  isBackstage(run: Run): boolean {
    if (!run.conversationId || !this.of(run.conversationId).backstage) return false;
    if (run.trigger.type === "handoff") return true;
    return this.hub.repos.items.cardsOf(run.id).some((i) => i.card?.type === "handoff" && (i.card.data as { returnResult?: boolean }).returnResult === true);
  }

  /** Whether a handoff card posted in a conversation stays backstage. */
  backstageIn(conversationId: string): boolean {
    return this.of(conversationId).backstage;
  }

  /** How to answer, for the bot that answers the user (a handed-off task is work, not a chat). */
  contextSection(_bot: Bot, run: Run): string | null {
    if (!run.conversationId || run.trigger.type === "handoff") return null;
    const way = this.of(run.conversationId);
    const lines: string[] = [];
    if (way.replyStyle === "chat") {
      lines.push(
        "This conversation is a chat: answer the way a person texts — one to three short sentences, warm and plain, " +
          "no headings, lists or tables unless the user asks for them. Give the conclusion, not the whole study; " +
          "offer to go into detail when there is more.",
      );
    }
    if (way.backstage) {
      lines.push(
        "Work you hand to colleagues and their answers stay backstage: the user sees only your final answer (and can " +
          "open the backstage). While you wait for them, do not narrate the plan to the user; when their answers " +
          "come, answer the user yourself.",
      );
    }
    return lines.length ? lines.join("\n") : null;
  }

  async routes(root: FastifyInstance): Promise<void> {
    const app = root.withTypeProvider<TypeBoxTypeProvider>();
    const Style = Type.Union([Type.Literal("chat"), Type.Literal("detailed")]);
    app.get("/api/v1/conversations/defaults", { schema: { tags: ["conversations"] } }, async (): Promise<ConversationDefaults> => this.defaults());
    app.put(
      "/api/v1/conversations/defaults",
      { schema: { tags: ["conversations"], body: Type.Object({ replyStyle: Type.Optional(Style), backstage: Type.Optional(Type.Boolean()) }, { additionalProperties: false }) } },
      async (req): Promise<ConversationDefaults> => {
        const next = { ...this.defaults(), ...req.body };
        this.settings.set(DEFAULTS_KEY, JSON.stringify(next));
        return next;
      },
    );
    app.put(
      "/api/v1/conversations/:id/style",
      {
        schema: {
          tags: ["conversations"],
          params: Type.Object({ id: Type.String() }),
          body: Type.Object(
            { replyStyle: Type.Optional(Type.Union([Style, Type.Null()])), backstage: Type.Optional(Type.Union([Type.Boolean(), Type.Null()])) },
            { additionalProperties: false },
          ),
        },
      },
      async (req) => {
        const conv = this.hub.conversationService.get(req.params.id);
        if (req.body.replyStyle !== undefined) exec(this.hub.db, "UPDATE conversations SET reply_style = ? WHERE id = ?", req.body.replyStyle as ReplyStyle | null, conv.id);
        if (req.body.backstage !== undefined)
          exec(this.hub.db, "UPDATE conversations SET backstage = ? WHERE id = ?", req.body.backstage === null ? null : req.body.backstage ? 1 : 0, conv.id);
        const saved = this.hub.conversationService.get(conv.id);
        this.hub.bus.publish("conversation.updated", { conversation: saved });
        return saved;
      },
    );
  }
}
