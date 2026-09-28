// The theme (specs/web-app): follow the system, or always light, or always
// dark — remembered per browser and applied as `data-theme` on <html>.
import { create } from "zustand";

export type Theme = "system" | "light" | "dark";
export const THEMES: Theme[] = ["system", "light", "dark"];
const STORAGE_KEY = "orbis.theme";
const DARK = "(prefers-color-scheme: dark)";

function initialTheme(): Theme {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "light" || saved === "dark" || saved === "system") return saved;
  } catch {
    /* storage unavailable */
  }
  return "system";
}

/** The colors in use: the choice, or the system's for "system". */
export function resolveTheme(theme: Theme): "light" | "dark" {
  if (theme !== "system") return theme;
  return typeof matchMedia === "function" && matchMedia(DARK).matches ? "dark" : "light";
}

export function applyTheme(theme: Theme): void {
  const resolved = resolveTheme(theme);
  const root = document.documentElement;
  root.dataset.theme = resolved;
  root.style.colorScheme = resolved;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", resolved === "dark" ? "#121216" : "#ffffff");
}

interface ThemeState {
  theme: Theme;
  setTheme(theme: Theme): void;
}

export const useTheme = create<ThemeState>((set) => ({
  theme: initialTheme(),
  setTheme(theme) {
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      /* storage unavailable */
    }
    applyTheme(theme);
    set({ theme });
  },
}));

/** Apply the saved theme and follow the system's changes while the choice is "system". */
export function startTheme(): void {
  applyTheme(useTheme.getState().theme);
  if (typeof matchMedia !== "function") return;
  matchMedia(DARK).addEventListener?.("change", () => {
    if (useTheme.getState().theme === "system") applyTheme("system");
  });
}
