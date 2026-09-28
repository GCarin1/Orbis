// The theme switch (specs/web-app): System → Light → Dark, remembered.
import type { ReactNode } from "react";
import { useT, type TextKey } from "../i18n.js";
import { THEMES, useTheme, type Theme } from "../theme.js";
import { AutoThemeIcon, MoonIcon, SunIcon } from "./Icons.js";

const ICONS: Record<Theme, ReactNode> = { system: <AutoThemeIcon />, light: <SunIcon />, dark: <MoonIcon /> };

/** One button that cycles the three choices (the sidebar). */
export function ThemeSwitch() {
  const t = useT();
  const { theme, setTheme } = useTheme();
  const next = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length]!;
  const label = `${t("theme.label")}: ${t(`theme.${theme}` as TextKey)}`;
  return (
    <button type="button" className="icon-btn theme-switch" aria-label={label} title={label} onClick={() => setTheme(next)}>
      {ICONS[theme]}
    </button>
  );
}

/** The three choices side by side (the settings screen). */
export function ThemeChoice() {
  const t = useT();
  const { theme, setTheme } = useTheme();
  return (
    <div className="segmented" role="radiogroup" aria-label={t("theme.label")}>
      {THEMES.map((option) => (
        <button
          key={option}
          type="button"
          role="radio"
          aria-checked={theme === option}
          className={theme === option ? "on" : ""}
          onClick={() => setTheme(option)}
        >
          {ICONS[option]} {t(`theme.${option}` as TextKey)}
        </button>
      ))}
    </div>
  );
}
