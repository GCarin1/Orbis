// specs/cloud — the account database in Supabase (change 0063-cloud-database, ADR 0020): every table of the
// hub has its cloud twin, owned by one account and closed to everyone else by row level security, and no
// secret ever has a place there.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MIGRATIONS } from "../src/db/migrations.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const cloud = readFileSync(path.join(root, "supabase/migrations/0001_orbis_core.sql"), "utf8");

const tablesIn = (sql: string, pattern: RegExp) => [...sql.matchAll(pattern)].map((m) => m[1]!);
const hubTables = tablesIn(MIGRATIONS.map((m) => m.sql).join("\n"), /CREATE TABLE (\w+)/g);
const cloudTables = tablesIn(cloud, /create table public\.(\w+)/g);
/** The body of a cloud table's definition. */
const definition = (table: string) => cloud.slice(cloud.indexOf(`create table public.${table} (`)).split("\n);")[0]!;
/** The tables the row-level-security loop covers. */
const secured = (cloud.match(/foreach t in array array\[([\s\S]*?)\]/)?.[1] ?? "").match(/'(\w+)'/g)!.map((s) => s.slice(1, -1));

describe("the cloud schema", () => {
  it("has a twin of every hub table but the vault, each owned by an account", () => {
    const missing = hubTables.filter((t) => t !== "secrets" && t !== "sync_outbox" && !cloudTables.includes(t));
    expect(missing).toEqual([]);
    expect(cloudTables).not.toContain("secrets");
    for (const table of cloudTables.filter((t) => t !== "profiles")) {
      expect(definition(table), table).toMatch(/owner_id uuid not null default auth\.uid\(\) references auth\.users \(id\) on delete cascade/);
    }
  });

  it("closes every table to everyone but its owner, and to anonymous visitors", () => {
    expect(secured.sort()).toEqual(cloudTables.filter((t) => t !== "profiles").sort());
    for (const verb of ["select", "insert", "update", "delete"]) expect(cloud).toContain(`for ${verb} to authenticated`);
    expect(cloud).toContain("owner_id = (select auth.uid())");
    expect(cloud).toContain("force row level security");
    expect(cloud).toContain("revoke all on public.%I from anon");
    expect(cloud).toMatch(/alter table public\.profiles enable row level security/);
  });

  it("keeps secrets out: no secret setting, no routine webhook secret, no readable device token", () => {
    expect(definition("settings")).toContain("check (key not like 'secret:%')");
    expect(definition("routines")).not.toMatch(/\bsecret\b/);
    expect(cloud).toContain("revoke all on public.devices from authenticated");
    expect(cloud).toMatch(/grant select \(id, owner_id, name, last_seen_at, revoked_at, created_at\) on public\.devices/);
    expect(cloud).toMatch(/security definer set search_path = ''/);
  });
});
