import type { Bot, BotState } from "@orbis/shared";
import { useT } from "../i18n.js";

export const STATE_COLORS: Record<BotState, string> = {
  idle: "#94a3b8",
  thinking: "#3b82f6",
  working: "#f59e0b",
  waiting: "#a855f7",
  blocked: "#ef4444",
  done: "#22c55e",
};

export const STATE_ICONS: Record<BotState, string> = {
  idle: "○",
  thinking: "…",
  working: "⚙",
  waiting: "✋",
  blocked: "!",
  done: "✓",
};

/** Initials on the bot's color, ringed by its state color, with the state icon. */
export function Avatar({ bot, size = 40 }: { bot: Pick<Bot, "avatar" | "state" | "name">; size?: number }) {
  const t = useT();
  const label = t(`state.${bot.state}`);
  return (
    <span
      className={`avatar state-${bot.state}`}
      style={{ width: size, height: size, background: bot.avatar.color, boxShadow: `0 0 0 3px ${STATE_COLORS[bot.state]}` }}
      role="img"
      aria-label={`${bot.name}: ${label}`}
      title={label}
    >
      <span className="avatar-initials" style={{ fontSize: size * 0.38 }}>
        {bot.avatar.initials}
      </span>
      <span className="avatar-state" style={{ background: STATE_COLORS[bot.state] }} aria-hidden="true">
        {STATE_ICONS[bot.state]}
      </span>
    </span>
  );
}

export function StateLabel({ state }: { state: BotState }) {
  const t = useT();
  return (
    <span className="state-label" style={{ color: STATE_COLORS[state] }}>
      {STATE_ICONS[state]} {t(`state.${state}`)}
    </span>
  );
}
