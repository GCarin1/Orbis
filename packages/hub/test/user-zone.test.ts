// specs/routines, specs/bots — the user's timezone (change 0086-routine-local-timezone): the web app tells the hub
// the device's timezone; the bots read the date and time there, and a routine created without a timezone (by a
// bot or through the API) runs at the user's hour instead of UTC's.
import { afterEach, describe, expect, it } from "vitest";
import type { Routine } from "@orbis/shared";
import { identityText } from "../src/context/assemble.js";
import { chat, createBot, testHub, type TestHub } from "./helpers.js";

let t: TestHub | null = null;
afterEach(async () => {
  await t?.cleanup();
  t = null;
});

const tool = (name: string, input: object) => `/tool ${name} ${JSON.stringify(input)}`;

describe("the user's timezone", () => {
  it("is told by a device, refused when it is no timezone, and read by the bots as their date and time", async () => {
    t = await testHub();
    expect((await t.api("GET", "/api/v1/me/timezone")).body).toEqual({ timezone: null });
    expect((await t.api("PUT", "/api/v1/me/timezone", { timezone: "Mars/Olympus" })).status).toBe(400);
    expect((await t.api("PUT", "/api/v1/me/timezone", { timezone: "America/Sao_Paulo" })).body).toEqual({ timezone: "America/Sao_Paulo" });
    const ana = await createBot(t, { name: "Ana" });
    // 02:30 UTC on 2 October is still 1 October, 23:30, in São Paulo.
    const at = new Date("2026-10-02T02:30:00Z");
    expect(identityText(t.hub.botService.get(ana.id), at, "America/Sao_Paulo")).toContain("Today is Thursday, 1 October 2026 (America/Sao_Paulo); it is 23:30 there.");
  });

  it("is where a routine runs when it names no timezone, made by a bot or through the API", async () => {
    t = await testHub();
    await t.api("PUT", "/api/v1/me/timezone", { timezone: "America/Sao_Paulo" });
    const ana = await createBot(t, { name: "Ana", policy: { rules: [{ tool: "routine.create", decision: "allow" }], grants: [] } });
    await chat(t, ana.id, tool("routine.create", { name: "Resumo", instruction: "Resuma o dia", cron: "0 9 * * *" }));
    const made = await t.api("POST", `/api/v1/bots/${ana.id}/routines`, { name: "Carteira", trigger: { type: "cron", cron: "0 18 * * 1-5" }, instruction: "Carteira" });
    const routines = (await t.api("GET", `/api/v1/bots/${ana.id}/routines`)).body as Routine[];
    expect(routines.map((r) => [r.name, r.trigger.type === "cron" ? r.trigger.timezone : null]).sort()).toEqual([
      ["Carteira", "America/Sao_Paulo"],
      ["Resumo", "America/Sao_Paulo"],
    ]);
    expect(made.status).toBe(201);
    // A timezone given stays.
    const utc = await t.api("POST", `/api/v1/bots/${ana.id}/routines`, { name: "UTC", trigger: { type: "cron", cron: "0 9 * * *", timezone: "UTC" }, instruction: "x" });
    expect(utc.body.trigger.timezone).toBe("UTC");
  });
});
