// specs/cli — `orbis link` and `orbis unlink` (change 0066-runner-link): the account's email and password piped
// on stdin (never as arguments), the device linked, its state shown, and unlinked.
import { afterEach, describe, expect, it, vi } from "vitest";
import { generateKeyPairSync, sign } from "node:crypto";
import { runCli, startTestHub } from "./helpers.js";

const ISSUER = "https://tqjxkgxmnkypzbpirztw.supabase.co/auth/v1";

function cloud() {
  const pair = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const b64 = (v: object) => Buffer.from(JSON.stringify(v)).toString("base64url");
  const head = `${b64({ alg: "ES256", kid: "k1" })}.${b64({ iss: ISSUER, aud: "authenticated", role: "authenticated", sub: "6f1c2a4e-9b1d-4c3e-8f2a-1b2c3d4e5f60", email: "ana@example.com", exp: Math.floor(Date.now() / 1000) + 600 })}`;
  const session = `${head}.${sign("sha256", Buffer.from(head), { key: pair.privateKey, dsaEncoding: "ieee-p1363" }).toString("base64url")}`;
  const seen: string[] = [];
  const fetchMock = vi.fn(async (url: string | URL | Request, init: RequestInit = {}) => {
    const u = String(url);
    if (u.endsWith("/.well-known/jwks.json")) return Response.json({ keys: [{ ...pair.publicKey.export({ format: "jwk" }), kid: "k1", alg: "ES256", use: "sig" }] });
    seen.push(`${u.split("/").slice(-2).join("/")} ${String(init.body ?? "")}`);
    if (u.includes("/auth/v1/token")) {
      return JSON.parse(String(init.body)).password === "a long password"
        ? Response.json({ access_token: session })
        : Response.json({ error_code: "invalid_credentials", msg: "Invalid login credentials" }, { status: 400 });
    }
    if (u.endsWith("/rpc/register_device")) return Response.json([{ id: "11111111-2222-4333-8444-555555555555", token: "t".repeat(43) }]);
    return Response.json({ upserted: 0, deleted: 0 });
  });
  return { fetchMock, seen };
}

let hub: Awaited<ReturnType<typeof startTestHub>> | null = null;
afterEach(async () => {
  await hub?.cleanup();
  hub = null;
});

describe("orbis link", () => {
  it("links with the email and password from stdin, shows the device, and unlinks", async () => {
    const c = cloud();
    hub = await startTestHub({ fetch: c.fetchMock as typeof fetch });
    expect((await runCli(["link", "--status"], hub.env)).stdout).toContain("Not linked to an account. Run: orbis link");

    const wrong = await runCli(["link", "--name", "Celular"], hub.env, "ana@example.com\nnot it\n");
    expect(wrong.code).toBe(1);
    expect(wrong.stderr).toContain("Invalid login credentials");

    const linked = await runCli(["link", "--name", "Celular"], hub.env, "ana@example.com\na long password\n");
    expect(linked.stderr).toBe("");
    expect(linked.stdout).toContain("Linked. This hub now sends its data to your account; its keys stay here.");
    expect(linked.stdout).toContain('Device "Celular" of ana@example.com');
    expect(linked.stdout).not.toContain("t".repeat(43));
    expect(c.seen.some((s) => s.startsWith("rpc/register_device") && s.includes('"p_name":"Celular"'))).toBe(true);

    const status = JSON.parse((await runCli(["link", "--status", "--json"], hub.env)).stdout);
    expect(status.linked).toMatchObject({ name: "Celular", email: "ana@example.com" });
    expect((await runCli(["link", "--status"], hub.env)).stdout).toContain("cloud: none (choose one: orbis link --cloud https://…)");

    // The cloud this device relays to (change 0068): chosen once linked, shown in the status.
    const cloudSet = await runCli(["link", "--cloud", "https://orbis.example.workers.dev"], hub.env);
    expect(cloudSet.stdout).toMatch(/cloud: disconnected \(https:\/\/orbis\.example\.workers\.dev\)/);
    expect((await runCli(["link", "--cloud", "ftp://nope"], hub.env)).stderr).toContain("must be https://");

    expect((await runCli(["unlink"], hub.env)).stdout).toContain("Unlinked: the device's token no longer works");
    expect((await runCli(["link", "--status"], hub.env)).stdout).toContain("Not linked");
  });
});
