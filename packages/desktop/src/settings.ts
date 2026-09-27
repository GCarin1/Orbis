// The desktop app's settings file (userData/settings.json).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { DEFAULT_HUB_URL } from "./hub-launcher.js";

export interface DesktopSettings {
  hubUrl: string;
}

export function loadSettings(file: string): DesktopSettings {
  try {
    if (existsSync(file)) {
      const parsed = JSON.parse(readFileSync(file, "utf8")) as Partial<DesktopSettings>;
      if (typeof parsed.hubUrl === "string" && /^https?:\/\//.test(parsed.hubUrl)) return { hubUrl: parsed.hubUrl };
    }
  } catch {
    /* a broken file falls back to the defaults */
  }
  return { hubUrl: DEFAULT_HUB_URL };
}

export function saveSettings(file: string, settings: DesktopSettings): void {
  if (!/^https?:\/\//.test(settings.hubUrl)) throw new Error("the hub URL must start with http:// or https://");
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(settings, null, 2) + "\n");
}
