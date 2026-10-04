// specs/web-app — a routine's schedule picked from the usual repeats and read back in words (change 0055).
import { describe, expect, it } from "vitest";
import { cronOf, DEFAULT_PICK, describeSchedule, pickOf } from "../src/schedule.js";
import { translate, type TextKey } from "../src/i18n.js";

const pt = (key: string, vars?: Record<string, string | number>) => translate("pt-BR", key as TextKey, vars);
const en = (key: string, vars?: Record<string, string | number>) => translate("en", key as TextKey, vars);
const cron = (expr: string, timezone = "America/Sao_Paulo") => ({ type: "cron" as const, cron: expr, timezone });

describe("routine schedules", () => {
  it("turns each usual repeat into its cron and reads the cron back", () => {
    const cases: Array<[Partial<typeof DEFAULT_PICK>, string]> = [
      [{ repeat: "daily", time: "07:23" }, "23 7 * * *"],
      [{ repeat: "weekdays", time: "18:18" }, "18 18 * * 1-5"],
      [{ repeat: "weekly", time: "18:00", days: [5] }, "0 18 * * 5"],
      [{ repeat: "weekly", time: "08:30", days: [5, 1, 3] }, "30 8 * * 1,3,5"],
      [{ repeat: "monthly", time: "09:00", day: 15 }, "0 9 15 * *"],
      [{ repeat: "hourly", minute: 5 }, "5 * * * *"],
      [{ repeat: "custom", cron: " */15 9-17 * * 1-5 " }, "*/15 9-17 * * 1-5"],
    ];
    for (const [pick, expr] of cases) {
      expect(cronOf({ ...DEFAULT_PICK, ...pick })).toBe(expr);
      const back = pickOf(expr);
      expect(back.repeat).toBe(pick.repeat);
      expect(cronOf(back)).toBe(expr);
    }
    // Sunday as 7 reads as 0; anything else stays a cron.
    expect(pickOf("0 10 * * 7")).toMatchObject({ repeat: "weekly", days: [0] });
    expect(pickOf("0 9 1 1 *").repeat).toBe("custom");
    expect(pickOf("not a cron").repeat).toBe("custom");
  });

  it("says a schedule in the user's language, with the timezone only when it is not the device's", () => {
    const zone = "America/Sao_Paulo";
    expect(describeSchedule(cron("0 18 * * 5"), "pt-BR", pt, zone)).toBe("Toda semana — sexta-feira, às 18:00");
    expect(describeSchedule(cron("0 18 * * 1-5"), "pt-BR", pt, zone)).toBe("Dias úteis (seg a sex) às 18:00");
    expect(describeSchedule(cron("23 7 * * *"), "pt-BR", pt, zone)).toBe("Todo dia às 07:23");
    expect(describeSchedule(cron("30 8 * * 1,3,5"), "pt-BR", pt, zone)).toBe("Toda semana — segunda-feira, quarta-feira e sexta-feira, às 08:30");
    expect(describeSchedule(cron("0 9 15 * *"), "en", en, zone)).toBe("Every month on day 15, at 09:00 AM");
    expect(describeSchedule(cron("*/10 * * * *"), "en", en, zone)).toBe("Custom schedule: */10 * * * *");
    expect(describeSchedule(cron("0 18 * * 5", "Europe/Lisbon"), "pt-BR", pt, zone)).toBe("Toda semana — sexta-feira, às 18:00 (Europe/Lisbon)");
    expect(describeSchedule({ type: "webhook" }, "pt-BR", pt, zone)).toBe("Quando chegar um webhook assinado");
  });
});
