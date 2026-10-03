// Pairing a phone (specs/hub-api, specs/android-app): the web app on the computer asks for a short code and
// the Android app trades it for the hub's token, once, instead of the user typing the token. A code lives
// five minutes, works once and dies after five wrong tries; tries from anywhere are limited per minute too,
// so six digits cannot be guessed.
import { randomInt, timingSafeEqual } from "node:crypto";
import type { AddressInfo } from "node:net";
import os from "node:os";
import type { FastifyInstance } from "fastify";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import Type from "typebox";
import type { PairingCode } from "@orbis/shared";
import type { HubContext } from "../context.js";
import { HttpError } from "../errors.js";

export const PAIRING_TTL_MS = 5 * 60_000;
export const PAIRING_TRIES = 5;
export const CLAIMS_PER_MINUTE = 20;

export type ClaimResult = "ok" | "invalid" | "busy";

export class PairingCodes {
  private current: { code: string; expiresAt: number; triesLeft: number } | null = null;
  private claims: number[] = [];

  constructor(private readonly now: () => number = Date.now) {}

  /** A new code; the one before stops working. */
  create(): { code: string; expiresAt: string } {
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    this.current = { code, expiresAt: this.now() + PAIRING_TTL_MS, triesLeft: PAIRING_TRIES };
    return { code, expiresAt: new Date(this.current.expiresAt).toISOString() };
  }

  cancel(): void {
    this.current = null;
  }

  /** "ok" uses the code up; "invalid" is a wrong, used or expired code; "busy" is too many tries this minute. */
  claim(input: string): ClaimResult {
    const at = this.now();
    this.claims = this.claims.filter((t) => at - t < 60_000);
    if (this.claims.length >= CLAIMS_PER_MINUTE) return "busy";
    this.claims.push(at);
    const current = this.current;
    if (!current || current.expiresAt <= at) {
      this.current = null;
      return "invalid";
    }
    const given = Buffer.from(input.replace(/\D/g, ""));
    const wanted = Buffer.from(current.code);
    if (given.length === wanted.length && timingSafeEqual(given, wanted)) {
      this.current = null;
      return "ok";
    }
    if (--current.triesLeft <= 0) this.current = null;
    return "invalid";
  }
}

/** Whether the hub takes connections from the network (ORBIS_HOST other than this computer). */
export function listensOnNetwork(host: string): boolean {
  return !/^(127\.|localhost$|::1$|\[::1\]$)/i.test(host.trim());
}

/** This computer's IPv4 addresses on its network cards (Wi-Fi, cable, VPN). */
export function networkAddresses(interfaces: NodeJS.Dict<os.NetworkInterfaceInfo[]> = os.networkInterfaces()): string[] {
  const found: string[] = [];
  for (const list of Object.values(interfaces)) {
    for (const a of list ?? []) {
      if (!a.internal && (a.family === "IPv4" || (a.family as unknown) === 4)) found.push(a.address);
    }
  }
  return found;
}

const ClaimBody = Type.Object({ code: Type.String({ minLength: 1, maxLength: 20 }) }, { additionalProperties: false });

export async function registerPairingRoutes(root: FastifyInstance, ctx: HubContext, codes = new PairingCodes()): Promise<void> {
  const app = root.withTypeProvider<TypeBoxTypeProvider>();
  const port = () => (app.server.address() as AddressInfo | null)?.port ?? ctx.config.port;

  app.post("/api/v1/pairing", { schema: { tags: ["pairing"] } }, async (): Promise<PairingCode> => {
    const { code, expiresAt } = codes.create();
    const listening = listensOnNetwork(ctx.config.host);
    return { code, expiresAt, listening, addresses: networkAddresses().map((ip) => `http://${ip}:${port()}/`) };
  });
  app.delete("/api/v1/pairing", { schema: { tags: ["pairing"] } }, async (_req, reply) => {
    codes.cancel();
    reply.code(204);
    return null;
  });
  // The one route without the token: the phone has none yet (server.ts lets it through).
  app.post("/api/v1/pairing/claim", { schema: { tags: ["pairing"], body: ClaimBody, security: [] } }, async (req) => {
    const result = codes.claim(req.body.code);
    if (result === "busy") throw new HttpError(429, "too_many_tries", "too many pairing tries: wait a minute");
    if (result === "invalid") throw new HttpError(401, "invalid_code", "the pairing code is wrong, used or expired: make a new one on the computer");
    return { token: ctx.config.token };
  });
}
