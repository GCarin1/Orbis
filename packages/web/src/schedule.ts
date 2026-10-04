// A routine's schedule as people say it (specs/web-app): the usual repeats picked from a list and read back
// in words ("Every week — Friday, at 18:00"); any other cron stays a cron.
import type { RoutineTrigger } from "@orbis/shared";

export type Repeat = "daily" | "weekdays" | "weekly" | "monthly" | "hourly" | "custom";

export interface SchedulePick {
  repeat: Repeat;
  /** HH:MM, for daily, weekdays, weekly and monthly. */
  time: string;
  /** 0 (Sunday) to 6, for weekly. */
  days: number[];
  /** 1 to 31, for monthly. */
  day: number;
  /** 0 to 59, for hourly. */
  minute: number;
  /** The cron itself, for custom. */
  cron: string;
}

export const DEFAULT_PICK: SchedulePick = { repeat: "weekdays", time: "09:00", days: [1], day: 1, minute: 0, cron: "0 9 * * 1-5" };

const pad = (n: number) => String(n).padStart(2, "0");
const num = (s: string, min: number, max: number): number | null => {
  if (!/^\d{1,2}$/.test(s)) return null;
  const n = Number(s);
  return n >= min && n <= max ? n : null;
};

/** The cron a pick stands for. */
export function cronOf(pick: SchedulePick): string {
  const [h, m] = pick.time.split(":").map(Number) as [number, number];
  const at = `${Number.isFinite(m) ? m : 0} ${Number.isFinite(h) ? h : 9}`;
  switch (pick.repeat) {
    case "daily":
      return `${at} * * *`;
    case "weekdays":
      return `${at} * * 1-5`;
    case "weekly":
      return `${at} * * ${[...new Set(pick.days)].sort((a, b) => a - b).join(",") || "1"}`;
    case "monthly":
      return `${at} ${pick.day} * *`;
    case "hourly":
      return `${pick.minute} * * * *`;
    default:
      return pick.cron.trim();
  }
}

/** The pick a cron reads as: one of the usual repeats, or custom. */
export function pickOf(cron: string): SchedulePick {
  const custom = { ...DEFAULT_PICK, repeat: "custom" as const, cron: cron.trim() };
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return custom;
  const [mi, hi, dom, mon, dow] = parts as [string, string, string, string, string];
  const minute = num(mi, 0, 59);
  if (minute === null || mon !== "*") return custom;
  if (hi === "*" && dom === "*" && dow === "*") return { ...custom, repeat: "hourly", minute };
  const hour = num(hi, 0, 23);
  if (hour === null) return custom;
  const time = `${pad(hour)}:${pad(minute)}`;
  if (dom === "*" && dow === "*") return { ...custom, repeat: "daily", time };
  if (dom === "*" && dow === "1-5") return { ...custom, repeat: "weekdays", time };
  if (dom === "*" && /^[0-7](,[0-7])*$/.test(dow)) {
    return { ...custom, repeat: "weekly", time, days: [...new Set(dow.split(",").map((d) => Number(d) % 7))].sort((a, b) => a - b) };
  }
  const day = num(dom, 1, 31);
  if (day !== null && dow === "*") return { ...custom, repeat: "monthly", time, day };
  return custom;
}

/** Weekday names, Sunday first, in the language. */
export function weekdayNames(lang: string, width: "long" | "short" = "long"): string[] {
  // 2024-01-07 was a Sunday.
  return Array.from({ length: 7 }, (_, i) => new Date(Date.UTC(2024, 0, 7 + i)).toLocaleDateString(lang, { weekday: width, timeZone: "UTC" }));
}

function clock(time: string, lang: string): string {
  const [h, m] = time.split(":").map(Number) as [number, number];
  return new Date(Date.UTC(2024, 0, 1, h, m)).toLocaleTimeString(lang, { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
}

function list(items: string[], lang: string): string {
  try {
    return new Intl.ListFormat(lang, { style: "long", type: "conjunction" }).format(items);
  } catch {
    return items.join(", ");
  }
}

export const localZone = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
};

type T = (key: string, vars?: Record<string, string | number>) => string;

/** A trigger in words, with its timezone when it is not this device's. */
export function describeSchedule(trigger: RoutineTrigger, lang: string, t: T, zone = localZone()): string {
  if (trigger.type === "webhook") return t("routines.when.webhook");
  const pick = pickOf(trigger.cron);
  const time = clock(pick.time, lang);
  const text =
    pick.repeat === "daily"
      ? t("routines.when.daily", { time })
      : pick.repeat === "weekdays"
        ? t("routines.when.weekdays", { time })
        : pick.repeat === "weekly"
          ? t("routines.when.weekly", { days: list(pick.days.map((d) => weekdayNames(lang)[d]!), lang), time })
          : pick.repeat === "monthly"
            ? t("routines.when.monthly", { day: pick.day, time })
            : pick.repeat === "hourly"
              ? t("routines.when.hourly", { minute: pad(pick.minute) })
              : t("routines.when.custom", { cron: trigger.cron });
  return trigger.timezone && trigger.timezone !== zone ? `${text} (${trigger.timezone})` : text;
}
