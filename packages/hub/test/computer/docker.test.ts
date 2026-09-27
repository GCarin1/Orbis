// specs/computer — acceptance criterion 4 (the docker provider through a
// recorded command runner) and the noVNC proxy.
import { afterEach, describe, expect, it } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import websocket from "@fastify/websocket";
import type { AddressInfo } from "node:net";
import { DockerProvider, type CommandResult, type CommandRunner } from "../../src/computer/docker.js";
import { chat, createBot, testHub, type TestHub } from "../helpers.js";

let t: TestHub | null = null;
let upstream: FastifyInstance | null = null;
afterEach(async () => {
  await t?.cleanup();
  t = null;
  await upstream?.close();
  upstream = null;
});

/** A fake docker CLI: records every call and keeps the container's state. */
function recorder(ports: { vnc: number; cdp: number } = { vnc: 49153, cdp: 49154 }) {
  const calls: string[][] = [];
  let exists = false;
  let running = false;
  const ok = (stdout = ""): CommandResult => ({ code: 0, stdout, stderr: "" });
  const run: CommandRunner = async (args) => {
    calls.push(args);
    switch (args[0]) {
      case "inspect":
        return exists ? ok(running ? "true\n" : "false\n") : { code: 1, stdout: "", stderr: "Error: No such object" };
      case "create":
        exists = true;
        return ok("abc123\n");
      case "start":
        running = true;
        return ok();
      case "stop":
        running = false;
        return ok();
      case "rm":
        exists = running = false;
        return ok();
      case "exec":
        return ok(`ran: ${args.at(-1)}\n`);
      case "port":
        return ok(`127.0.0.1:${args[2] === "6080/tcp" ? ports.vnc : ports.cdp}\n`);
      default:
        return ok();
    }
  };
  return { run, calls, verbs: () => calls.map((c) => (c[0] === "volume" ? `volume ${c[1]}` : c[0]!)) };
}

const dockerBot = { computer: { enabled: true, provider: "docker", cpus: 2, memoryMb: 1024, hibernateAfterMin: 5 }, policy: { rules: [{ tool: "computer.shell", decision: "allow" }], grants: [] } };

describe("computer (docker provider)", () => {
  it("creates the container with limits and a per-bot volume, starts it before a tool, stops it when idle and removes it on delete (criterion 4)", async () => {
    const docker = recorder();
    t = await testHub({ computerProviders: [new DockerProvider(docker.run)] });
    const bot = await createBot(t, dockerBot);
    const workspace = t.hub.computer.workspaceDir(bot.id);

    const { runs } = await chat(t, bot.id, '/tool computer.shell {"command":"uname -a"}');
    expect(runs[0].steps.find((s: { type: string }) => s.type === "tool_result")).toMatchObject({ isError: false, output: "exit code: 0\nran: uname -a" });
    expect(docker.verbs()).toEqual(["inspect", "volume create", "create", "start", "exec"]);

    const create = docker.calls[2]!;
    const flag = (name: string) => create[create.indexOf(name) + 1];
    expect(flag("--name")).toBe(`orbis-${bot.id}`);
    expect(flag("--cpus")).toBe("2");
    expect(flag("--memory")).toBe("1024m");
    expect(create).toContain(`type=volume,source=orbis-home-${bot.id},target=/home/orbis`);
    expect(create).toContain(`type=bind,source=${workspace},target=/home/orbis/workspace`);
    expect(create.filter((a) => a.startsWith("127.0.0.1::"))).toEqual(["127.0.0.1::6080", "127.0.0.1::9223"]);
    expect(create.at(-1)).toBe("orbis/desktop:latest");
    expect(docker.calls[1]).toEqual(["volume", "create", "--label", `orbis.bot=${bot.id}`, `orbis-home-${bot.id}`]);
    // The command runs in the workspace and is killed inside the container at its timeout.
    expect(docker.calls[4]).toEqual(["exec", "--workdir", "/home/orbis/workspace", `orbis-${bot.id}`, "timeout", "--signal=KILL", "120", "sh", "-c", "uname -a"]);

    // A second tool reuses the running container.
    await chat(t, bot.id, '/tool computer.shell {"command":"true"}');
    expect(docker.verbs().slice(5)).toEqual(["exec"]);

    const status = (await t.api("GET", `/api/v1/bots/${bot.id}/computer`)).body;
    expect(status).toMatchObject({ provider: "docker", status: "running", vncPath: `/api/v1/bots/${bot.id}/computer/vnc/vnc.html` });

    // Idle past hibernateAfter: stopped, volume kept.
    expect(await t.hub.computer.sweep(Date.now() + 6 * 60_000)).toEqual([bot.id]);
    expect(docker.verbs().slice(-2)).toEqual(["inspect", "stop"]);
    expect(docker.calls.at(-1)).toEqual(["stop", "--time", "10", `orbis-${bot.id}`]);

    // The next tool starts the stopped container again (no second create).
    await chat(t, bot.id, '/tool computer.shell {"command":"true"}');
    expect(docker.verbs().slice(-3)).toEqual(["inspect", "start", "exec"]);

    // Delete: container and volume removed.
    await t.api("DELETE", `/api/v1/bots/${bot.id}`);
    expect(docker.calls.slice(-2)).toEqual([
      ["rm", "--force", "--volumes", `orbis-${bot.id}`],
      ["volume", "rm", "--force", `orbis-home-${bot.id}`],
    ]);
  });

  it("reports a failing docker as a clear error, not a crash", async () => {
    const run: CommandRunner = async (args) =>
      args[0] === "inspect" ? { code: 1, stdout: "", stderr: "" } : { code: 1, stdout: "", stderr: "Cannot connect to the Docker daemon at unix:///var/run/docker.sock" };
    t = await testHub({ computerProviders: [new DockerProvider(run)] });
    const bot = await createBot(t, dockerBot);
    const res = await t.api("POST", `/api/v1/bots/${bot.id}/computer/start`);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({ code: "computer_unavailable", message: expect.stringMatching(/docker volume create failed: Cannot connect to the Docker daemon/) });
  });

  it("proxies noVNC pages and its WebSocket behind a path-scoped cookie", async () => {
    upstream = Fastify();
    await upstream.register(websocket);
    upstream.get("/vnc.html", async (_req, reply) => reply.type("text/html").send("<title>noVNC</title>"));
    upstream.get("/websockify", { websocket: true }, (socket) => {
      socket.on("message", (data: Buffer) => socket.send(Buffer.concat([Buffer.from("echo:"), data])));
    });
    await upstream.listen({ port: 0, host: "127.0.0.1" });
    const vncPort = (upstream.server.address() as AddressInfo).port;

    const docker = recorder({ vnc: vncPort, cdp: 1 });
    t = await testHub({ computerProviders: [new DockerProvider(docker.run)] });
    const bot = await createBot(t, dockerBot);
    const other = await createBot(t, { ...dockerBot, name: "Bob" });
    await t.api("POST", `/api/v1/bots/${bot.id}/computer/start`);

    const session = await t.api("POST", `/api/v1/bots/${bot.id}/computer/vnc-session`);
    expect(session.body.url).toBe(`/api/v1/bots/${bot.id}/computer/vnc/vnc.html?autoconnect=1&resize=scale&reconnect=1&path=${encodeURIComponent(`api/v1/bots/${bot.id}/computer/vnc/websockify`)}`);
    const cookie = String(session.headers["set-cookie"]).split(";")[0]!;
    expect(String(session.headers["set-cookie"])).toContain(`Path=/api/v1/bots/${bot.id}/computer/vnc/; HttpOnly; SameSite=Strict`);

    const page = await t.hub.app.inject({ method: "GET", url: `/api/v1/bots/${bot.id}/computer/vnc/vnc.html`, headers: { cookie } });
    expect(page.statusCode).toBe(200);
    expect(page.body).toBe("<title>noVNC</title>");
    // No cookie, or the cookie of another bot's path: refused.
    expect((await t.hub.app.inject({ method: "GET", url: `/api/v1/bots/${bot.id}/computer/vnc/vnc.html` })).statusCode).toBe(401);
    expect((await t.hub.app.inject({ method: "GET", url: `/api/v1/bots/${other.id}/computer/vnc/vnc.html`, headers: { cookie } })).statusCode).toBe(401);
    // A local bot has no desktop.
    const local = await createBot(t, { name: "Cara" });
    expect((await t.api("POST", `/api/v1/bots/${local.id}/computer/vnc-session`)).body.error.code).toBe("no_desktop");

    const url = (await t.hub.listen()).replace("http", "ws");
    const ws = new WebSocket(`${url}/api/v1/bots/${bot.id}/computer/vnc/websockify`, { headers: { cookie } } as never);
    ws.binaryType = "arraybuffer";
    const reply = await new Promise<string>((resolve, reject) => {
      ws.addEventListener("open", () => ws.send(new TextEncoder().encode("RFB 003.008")));
      ws.addEventListener("message", (e) => resolve(Buffer.from(e.data as ArrayBuffer).toString()));
      ws.addEventListener("error", () => reject(new Error("socket error")));
    });
    expect(reply).toBe("echo:RFB 003.008");
    ws.close();
  });
});
