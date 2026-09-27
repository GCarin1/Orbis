// REST surface of a bot's computer and the noVNC proxy (contracts/hub-surface).
import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import type { Bot } from "@orbis/shared";
import type { HubContext } from "../context.js";
import { conflict, HttpError, notFound } from "../errors.js";
import { IdParams } from "../api/schemas.js";
import type { BrowserService } from "./browser.js";
import { DockerError } from "./docker.js";
import { ComputerDisabledError } from "./manager.js";

const VNC_SESSION_MS = 12 * 60 * 60 * 1000;
export const VNC_COOKIE = "orbis_vnc";

/**
 * Cookies for the noVNC pages. An iframe cannot send the bearer header, so
 * the app asks for a cookie scoped to one bot's `/computer/vnc/` path.
 */
export class VncSessions {
  private readonly tokens = new Map<string, { botId: string; expires: number }>();

  issue(botId: string): string {
    const token = randomBytes(24).toString("base64url");
    this.tokens.set(token, { botId, expires: Date.now() + VNC_SESSION_MS });
    return token;
  }

  /** True when the request carries a live cookie for the bot named in its `/computer/vnc/` path. */
  allows(url: string, cookieHeader: string | undefined): boolean {
    const m = /^\/api\/v1\/bots\/([^/?]+)\/computer\/vnc\//.exec(url);
    if (!m || !cookieHeader) return false;
    for (const part of cookieHeader.split(";")) {
      const [name, ...rest] = part.trim().split("=");
      if (name !== VNC_COOKIE) continue;
      const session = this.tokens.get(rest.join("="));
      if (session && session.expires > Date.now() && session.botId === decodeURIComponent(m[1]!)) return true;
    }
    return false;
  }
}

/** Map computer failures to the one error shape. */
async function guarded<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof ComputerDisabledError) throw conflict("computer_disabled", err.message);
    if (err instanceof DockerError) throw conflict("computer_unavailable", err.message);
    if (err instanceof HttpError) throw err;
    throw conflict("computer_unavailable", err instanceof Error ? err.message : String(err));
  }
}

export async function registerComputerRoutes(root: FastifyInstance, ctx: HubContext, browser: BrowserService, vnc: VncSessions): Promise<void> {
  const app = root.withTypeProvider<TypeBoxTypeProvider>();
  const computers = ctx.computer;
  const bot = (id: string): Bot => ctx.botService.get(id);
  const schema = (extra: object = {}) => ({ tags: ["computer"], params: IdParams, ...extra });

  app.get("/api/v1/bots/:id/computer", { schema: schema() }, async (req) => computers.status(bot(req.params.id)));
  app.post("/api/v1/bots/:id/computer/start", { schema: schema() }, async (req) => {
    const b = bot(req.params.id);
    await guarded(() => computers.ensure(b));
    return computers.status(b);
  });
  app.post("/api/v1/bots/:id/computer/stop", { schema: schema() }, async (req) => {
    const b = bot(req.params.id);
    await guarded(() => computers.stop(b));
    return computers.status(b);
  });
  // Taking over starts the computer: the user is about to drive it.
  app.post("/api/v1/bots/:id/computer/takeover", { schema: schema() }, async (req) => {
    const b = bot(req.params.id);
    computers.takeover(b);
    await guarded(() => computers.ensure(b));
    return computers.status(b);
  });
  app.post("/api/v1/bots/:id/computer/release", { schema: schema() }, async (req) => computers.release(bot(req.params.id)));

  app.get("/api/v1/bots/:id/computer/screenshot", { schema: schema() }, async (req, reply) => {
    // The latest screenshot kept after the bot's last browser action; taking a new one
    // here would announce a new screenshot and make every viewer fetch again.
    const png = browser.lastScreenshot(bot(req.params.id).id);
    if (!png) throw notFound("screenshot (the bot has not opened its browser yet)");
    reply.header("cache-control", "no-store").type("image/png");
    return png;
  });

  // --- noVNC (docker provider) ---------------------------------------------------

  const vncPort = async (b: Bot): Promise<number> => {
    if (computers.providerKind(b) !== "docker") throw conflict("no_desktop", `@${b.handle}'s computer has no desktop; its live view is the browser screenshot`);
    const view = await guarded(() => computers.provider(b).view(b.id));
    if (!view.vncPort) throw conflict("computer_stopped", `@${b.handle}'s computer is not running`);
    return view.vncPort;
  };

  app.post("/api/v1/bots/:id/computer/vnc-session", { schema: schema() }, async (req, reply) => {
    const b = bot(req.params.id);
    await vncPort(b);
    const base = `/api/v1/bots/${b.id}/computer/vnc/`;
    reply.header("set-cookie", `${VNC_COOKIE}=${vnc.issue(b.id)}; Path=${base}; HttpOnly; SameSite=Strict; Max-Age=${VNC_SESSION_MS / 1000}`);
    return { url: `${base}vnc.html?autoconnect=1&resize=scale&reconnect=1&path=${encodeURIComponent(`${base.slice(1)}websockify`)}` };
  });

  // The VNC stream: one WebSocket piped to the container's websockify.
  app.get(
    "/api/v1/bots/:id/computer/vnc/websockify",
    { websocket: true, schema: { hide: true, params: IdParams } },
    async (socket, req) => {
      let upstream: WebSocket;
      try {
        const port = await vncPort(bot((req.params as { id: string }).id));
        upstream = new WebSocket(`ws://127.0.0.1:${port}/websockify`, ["binary"]);
      } catch {
        socket.close(1011, "computer not running");
        return;
      }
      upstream.binaryType = "arraybuffer";
      const early: Buffer[] = [];
      socket.on("message", (data: Buffer) => {
        if (upstream.readyState === WebSocket.OPEN) upstream.send(data);
        else early.push(data);
      });
      upstream.addEventListener("open", () => {
        for (const data of early.splice(0)) upstream.send(data);
      });
      upstream.addEventListener("message", (e) => socket.send(Buffer.from(e.data as ArrayBuffer)));
      upstream.addEventListener("close", () => socket.close());
      upstream.addEventListener("error", () => socket.close(1011, "vnc upstream error"));
      socket.on("close", () => upstream.close());
    },
  );

  // noVNC's static files (vnc.html, its scripts and images).
  app.get("/api/v1/bots/:id/computer/vnc/*", { schema: { hide: true } }, async (req, reply) => {
    const params = req.params as { id: string; "*": string };
    const port = await vncPort(bot(params.id));
    const search = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
    const upstream = await fetch(`http://127.0.0.1:${port}/${params["*"]}${search}`);
    reply.code(upstream.status);
    const type = upstream.headers.get("content-type");
    if (type) reply.type(type);
    reply.header("cache-control", "no-store");
    return Buffer.from(await upstream.arrayBuffer());
  });
}
