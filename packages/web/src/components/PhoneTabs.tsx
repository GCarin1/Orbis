// The phone's tab bar (change 0089-phone-tab-bar): Conversations, Library, Team and More at the bottom, as phone apps
// do, in place of the sidebar's seven rows that took a third of the screen. More opens a sheet with the rest.
import { useState, type ReactNode } from "react";
import { useT } from "../i18n.js";
import { Mascot } from "./Avatar.js";
import { BriefcaseIcon, ChatIcon, LibraryIcon, MoreIcon, PuzzleIcon, SkillsIcon, SlidersIcon, UsageIcon, UsersIcon } from "./Icons.js";
import { LanguageSwitch } from "./LanguageSwitch.js";
import type { View } from "./Sidebar.js";
import { ThemeSwitch } from "./ThemeSwitch.js";

const MORE: View[] = ["skills", "tools", "hiring", "usage", "settings"];

export function PhoneTabs({ view, onView, onHome }: { view: View; onView(view: View): void; onHome(): void }) {
  const t = useT();
  const [more, setMore] = useState(false);
  const tab = (label: string, icon: ReactNode, active: boolean, onClick: () => void, aria?: string) => (
    <button type="button" className={`phone-tab${active ? " active" : ""}`} aria-current={active ? "page" : undefined} aria-label={aria ?? label} onClick={onClick}>
      {icon}
      <span>{label}</span>
    </button>
  );
  // The same names the sidebar gives each screen, so a screen is found the same way on both.
  const row = (target: View, icon: ReactNode, label: string, symbol: string) => (
    <button
      type="button"
      className="nav-row"
      aria-label={`${symbol} ${label}`}
      onClick={() => {
        setMore(false);
        onView(target);
      }}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
  return (
    <>
      <nav className="phone-tabs" aria-label={t("tabs.label")}>
        {tab(t("nav.chat"), <ChatIcon />, view === "chat", onHome)}
        {tab(t("nav.library"), <LibraryIcon />, view === "library", () => onView("library"), `🖼 ${t("nav.library")}`)}
        {tab(t("tabs.team"), <UsersIcon />, view === "squads", () => onView("squads"), `🛡 ${t("nav.squads")}`)}
        {tab(t("tabs.more"), <MoreIcon />, more || MORE.includes(view), () => setMore(!more))}
      </nav>
      {more && (
        <div className="phone-sheet-backdrop" onClick={() => setMore(false)}>
          <div className="phone-sheet" role="dialog" aria-label={t("tabs.more")} onClick={(e) => e.stopPropagation()}>
            {row("skills", <SkillsIcon />, t("nav.skills"), "📘")}
            {row("tools", <PuzzleIcon />, t("nav.tools"), "🧩")}
            {row("hiring", <BriefcaseIcon />, t("nav.hiring"), "💼")}
            {row("usage", <UsageIcon />, t("nav.usage"), "📊")}
            {row("settings", <SlidersIcon />, t("nav.settings"), "⚙")}
            <div className="me">
              <Mascot size={28} />
              <span className="me-name">{t("sidebar.you")}</span>
              <ThemeSwitch />
              <LanguageSwitch />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
