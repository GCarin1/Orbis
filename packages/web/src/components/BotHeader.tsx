// A bot's conversation header, as a chat app shows a contact (specs/web-app): its face, name and what it
// does now; a tap on them opens its details, and the ⋮ menu holds the rest, like a group's.
import { useRef, useState, type ReactNode } from "react";
import type { Bot } from "@orbis/shared";
import { useT } from "../i18n.js";
import { Avatar, StateLabel } from "./Avatar.js";
import { brainLabel, brainShort } from "./brains.js";
import { useDismiss } from "./GroupInfo.js";
import { BackIcon, ClockIcon, EraseIcon, GearIcon, InfoIcon, MonitorIcon, MoreIcon } from "./Icons.js";

export type BotPanelName = "details" | "computer" | "routines" | "settings";

export function BotHeader({
  bot,
  computerRunning,
  onBack,
  onPanel,
  onClear,
}: {
  bot: Bot;
  computerRunning: boolean;
  onBack(): void;
  onPanel(panel: BotPanelName): void;
  onClear(): void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(open, ref, () => setOpen(false));
  const item = (label: string, icon: ReactNode, run: () => void, extra?: ReactNode) => (
    <button
      type="button"
      role="menuitem"
      onClick={() => {
        setOpen(false);
        run();
      }}
    >
      {icon}
      <span>{label}</span>
      {extra}
    </button>
  );
  return (
    <header className="conv-head bot-head">
      <button className="icon-btn back" aria-label={t("nav.back")} onClick={onBack}>
        <BackIcon />
      </button>
      <button type="button" className="group-face-btn" aria-label={t("panel.details")} title={t("panel.details")} onClick={() => onPanel("details")}>
        <Avatar bot={bot} size={38} />
      </button>
      <div className="conv-title" onClick={() => onPanel("details")} data-testid="bot-title">
        <h1>
          {bot.name} <span className="muted">@{bot.handle}</span>
        </h1>
        <div className="conv-meta">
          {bot.role && <span className="conv-role">{bot.role}</span>}
          <span className="badge" title={brainLabel(t, bot.brain.kind)} data-testid="brain-badge">
            🧠 {brainShort(t, bot.brain.kind)}
            {bot.brain.model ? ` · ${bot.brain.model}` : ""}
          </span>
          <StateLabel state={bot.state} />
        </div>
      </div>
      <div className="conv-actions">
        <div className="new-menu group-menu" ref={ref}>
          <button
            type="button"
            className="icon-btn"
            aria-label={t("bot.menu")}
            title={t("bot.menu")}
            aria-haspopup="menu"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            <MoreIcon />
            {computerRunning && <span className="dot-running" aria-hidden="true" />}
          </button>
          {open && (
            <div className="menu" role="menu" aria-label={t("bot.menu")}>
              {item(t("panel.details"), <InfoIcon size={16} />, () => onPanel("details"))}
              {item(t("routines.open"), <ClockIcon size={16} />, () => onPanel("routines"))}
              {item(
                t("computer.open"),
                <MonitorIcon size={16} />,
                () => onPanel("computer"),
                computerRunning ? <span className="menu-note">{t("computer.on")}</span> : null,
              )}
              {item(t("settings.open"), <GearIcon size={16} />, () => onPanel("settings"))}
              {item(t("conv.clear"), <EraseIcon size={16} />, onClear)}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
