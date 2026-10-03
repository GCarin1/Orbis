// specs/hub-api, specs/android-app — pairing a phone with a short code instead of the token (change 0044).
import { afterEach, describe, expect, it } from "vitest";
import { CLAIMS_PER_MINUTE, listensOnNetwork, networkAddresses, PAIRING_TRIES, PAIRING_TTL_MS, PairingCodes } from "../src/api/pairing-routes.js";
import { testHub, TOKEN, type TestHub } from "./helpers.js";

let t: TestHub | null = null;
afterEach(async () => {
  await t?.cleanup();
  t = null;
});

describe("pairing codes", () => {
  it("work once, for five minutes, and die after five wrong tries", () => {
    let now = 1_000;
    const codes = new PairingCodes(() => now);
    const { code } = codes.create();
    expect(code).toMatch(/^\d{6}$/);
    const wrong = code === "000000" ? "111111" : "000000";
    for (let i = 0; i < PAIRING_TRIES - 1; i++) expect(codes.claim(wrong)).toBe("invalid");
    expect(codes.claim(`${code.slice(0, 3)} ${code.slice(3)}`)).toBe("ok"); // spaces and dashes are fine
    expect(codes.claim(code)).toBe("invalid"); // used

    const second = codes.create().code;
    for (let i = 0; i < PAIRING_TRIES; i++) codes.claim(second === "000000" ? "111111" : "000000");
    expect(codes.claim(second)).toBe("invalid"); // dead after five wrong tries

    const third = codes.create().code;
    now += PAIRING_TTL_MS;
    expect(codes.claim(third)).toBe("invalid"); // expired

    const fourth = codes.create().code;
    codes.cancel();
    expect(codes.claim(fourth)).toBe("invalid");
  });

  it("limit tries from anywhere per minute", () => {
    let now = 0;
    const codes = new PairingCodes(() => now);
    const { code } = codes.create();
    for (let i = 0; i < CLAIMS_PER_MINUTE; i++) codes.claim("x");
    expect(codes.claim(code)).toBe("busy");
    now += 60_000;
    expect(codes.claim(code)).not.toBe("busy");
  });

  it("know when the hub takes connections from the network, and this computer's addresses", () => {
    expect(listensOnNetwork("127.0.0.1")).toBe(false);
    expect(listensOnNetwork("localhost")).toBe(false);
    expect(listensOnNetwork("::1")).toBe(false);
    expect(listensOnNetwork("0.0.0.0")).toBe(true);
    expect(listensOnNetwork("192.168.0.10")).toBe(true);
    expect(
      networkAddresses({
        lo: [{ address: "127.0.0.1", family: "IPv4", internal: true, netmask: "", mac: "", cidr: null }],
        wifi: [
          { address: "192.168.0.10", family: "IPv4", internal: false, netmask: "", mac: "", cidr: null },
          { address: "fe80::1", family: "IPv6", internal: false, netmask: "", mac: "", cidr: null, scopeid: 0 },
        ],
      }),
    ).toEqual(["192.168.0.10"]);
  });
});

describe("the pairing routes", () => {
  it("make a code with the signed-in web app, and give the token for it once, to a phone that has none", async () => {
    t = await testHub();
    expect((await t.api("POST", "/api/v1/pairing", {}, null)).status).toBe(401);
    const made = await t.api("POST", "/api/v1/pairing", {});
    expect(made.status).toBe(200);
    expect(made.body).toMatchObject({ code: expect.stringMatching(/^\d{6}$/), listening: false, addresses: expect.any(Array) });
    for (const address of made.body.addresses) expect(address).toMatch(/^http:\/\/\d+\.\d+\.\d+\.\d+:\d+\/$/);

    const claimed = await t.api("POST", "/api/v1/pairing/claim", { code: made.body.code }, null);
    expect(claimed).toMatchObject({ status: 200, body: { token: TOKEN } });
    const again = await t.api("POST", "/api/v1/pairing/claim", { code: made.body.code }, null);
    expect(again.status).toBe(401);
    expect(again.body.error.code).toBe("invalid_code");
    // Every other route still asks for the token.
    expect((await t.api("GET", "/api/v1/bots", undefined, null)).status).toBe(401);

    const next = await t.api("POST", "/api/v1/pairing", {});
    expect((await t.api("DELETE", "/api/v1/pairing")).status).toBe(204);
    expect((await t.api("POST", "/api/v1/pairing/claim", { code: next.body.code }, null)).status).toBe(401);
  });
});
