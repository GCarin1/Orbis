// The user's timezone (change 0086-routine-local-timezone): the web app tells the hub the timezone of the device
// it runs on, so the bots read the date and time where the user is (the hub itself often runs in UTC, in a
// container), and a routine a bot creates without a timezone runs at the user's hour, not UTC's.
import type { FastifyInstance } from "fastify";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import Type from "typebox";
import type { HubContext } from "../context.js";
import { badRequest } from "../errors.js";
import { SettingsRepo } from "../repos/settings.js";

const KEY = "user.timezone";

/** Whether a name is an IANA timezone this runtime knows. */
export function isTimezone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

export class UserZone {
  private readonly settings: SettingsRepo;

  constructor(hub: HubContext) {
    this.settings = new SettingsRepo(hub.db);
  }

  /** The user's timezone, once a device told it; null before. */
  get(): string | null {
    const zone = this.settings.get(KEY);
    return zone && isTimezone(zone) ? zone : null;
  }

  set(zone: string): string {
    if (!isTimezone(zone)) throw badRequest("invalid timezone", { timezone: `"${zone}" is not an IANA timezone` });
    if (this.settings.get(KEY) !== zone) this.settings.set(KEY, zone);
    return zone;
  }

  async routes(root: FastifyInstance): Promise<void> {
    const app = root.withTypeProvider<TypeBoxTypeProvider>();
    app.get("/api/v1/me/timezone", { schema: { tags: ["me"] } }, async () => ({ timezone: this.get() }));
    app.put(
      "/api/v1/me/timezone",
      { schema: { tags: ["me"], body: Type.Object({ timezone: Type.String({ minLength: 1, maxLength: 64 }) }, { additionalProperties: false }) } },
      async (req) => ({ timezone: this.set(req.body.timezone) }),
    );
  }
}
