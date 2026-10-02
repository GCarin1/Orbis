// specs/agent-runtimes — how the chat-http brain makes its requests (change 0035): through the
// system's curl, with the token kept off the command line, and through Node's fetch.
import { afterEach, describe, expect, it } from "vitest";
import { chmodSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  curlCandidates,
  curlTransport,
  envProxy,
  fetchTransport,
  findCurl,
  parseHead,
  readText,
  transportFor,
  TransportError,
} from "../../src/brains/http-transport.js";

let server: Server | null = null;
const dirs: string[] = [];
afterEach(async () => {
  await new Promise<void>((r) => (server ? server.close(() => r()) : r()));
  server = null;
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
const tmp = () => {
  const d = mkdtempSync(path.join(tmpdir(), "orbis-transport-test-"));
  dirs.push(d);
  return d;
};
const leftovers = () => readdirSync(tmpdir()).filter((n) => n.startsWith("orbis-curl-"));
const SECRET = "tok.en.never-in-argv";

describe("the head curl prints", () => {
  it("reads the status and the content type, skips an interim 100, and hands back the start of the body", () => {
    const head = parseHead(Buffer.from("HTTP/2 200 \r\ncontent-type: text/event-stream; charset=utf-8\r\nx-a: b\r\n\r\nevent: x\n"));
    expect(head).toMatchObject({ status: 200, contentType: "text/event-stream; charset=utf-8" });
    expect(head!.rest.toString()).toBe("event: x\n");
    expect(parseHead(Buffer.from("HTTP/1.1 100 Continue\r\n\r\nHTTP/1.1 403 Forbidden\r\n\r\n"))).toMatchObject({ status: 100 });
    expect(parseHead(Buffer.from("HTTP/1.1 403 Forbidden\nContent-Type: text/html\n\n<html>"))).toMatchObject({ status: 403, contentType: "text/html" });
    expect(parseHead(Buffer.from("HTTP/1.1 200 OK\r\ncontent-type: text/plain\r\n"))).toBeNull(); // the head is not complete yet
  });
});

describe.skipIf(process.platform === "win32")("through a curl that is not the real one", () => {
  /** A fake curl: it records its arguments, its header file and its stdin, then answers like the real one. */
  const fakeCurl = (answer: string, exit = 0) => {
    const dir = tmp();
    const record = path.join(dir, "record.json");
    const file = path.join(dir, "curl");
    writeFileSync(
      file,
      `#!/usr/bin/env node
const fs = require("node:fs");
const args = process.argv.slice(2);
const at = args.findIndex((a) => a === "-H" && args[args.indexOf(a) + 1]?.startsWith("@"));
const headerFile = args.filter((a) => a.startsWith("@"))[0]?.slice(1);
let stdin = "";
process.stdin.on("data", (d) => (stdin += d));
process.stdin.on("end", () => {
  fs.writeFileSync(${JSON.stringify(record)}, JSON.stringify({ args, headers: headerFile ? fs.readFileSync(headerFile, "utf8") : null, headerFile, stdin }));
  process.stdout.write(${JSON.stringify(answer)});
  process.exit(${exit});
});
`,
      { mode: 0o755 },
    );
    chmodSync(file, 0o755);
    return { file, record: () => JSON.parse(readFileSync(record, "utf8")) as { args: string[]; headers: string; headerFile: string; stdin: string } };
  };

  it("keeps the token off the command line, in a private file that is gone afterwards, and sends the body on stdin", async () => {
    const fake = fakeCurl("HTTP/2 200 \r\ncontent-type: text/event-stream\r\n\r\ndata: {}\n\n");
    const before = leftovers().length;
    const res = await curlTransport(fake.file)({
      method: "POST",
      url: "https://chat.example.com/v1/chat",
      headers: { accept: "*/*", authorization: `Bearer ${SECRET}`, "sec-ch-ua": '"Chromium";v="154"' },
      form: { name: "data", value: '{"input":"olá 🚀"}' },
      signal: new AbortController().signal,
    });
    expect(res).toMatchObject({ status: 200, contentType: "text/event-stream" });
    expect(await readText(res)).toBe("data: {}\n\n");
    const seen = fake.record();
    expect(seen.args.join(" ")).not.toContain(SECRET);
    expect(seen.args).toEqual(
      expect.arrayContaining(["-q", "--silent", "--show-error", "--no-buffer", "--include", "-F", "data=<-", "--url", "https://chat.example.com/v1/chat"]),
    );
    expect(seen.args.some((a) => a.startsWith("@"))).toBe(true);
    expect(seen.headers).toContain(`authorization: Bearer ${SECRET}`);
    expect(seen.headers).toContain('sec-ch-ua: "Chromium";v="154"');
    expect(seen.stdin).toBe('{"input":"olá 🚀"}');
    expect(leftovers().length).toBe(before); // the header file (with the token) did not stay behind
  });

  it("goes through the proxy it is given, signing in as the Windows user, or through none", async () => {
    const fake = fakeCurl("HTTP/1.1 200 OK\r\ncontent-type: text/plain\r\n\r\nok");
    const get = (proxy: string | null) =>
      curlTransport(fake.file, { proxy })({ method: "GET", url: "https://a.example/", headers: {}, signal: new AbortController().signal }).then(readText);
    await get("http://proxy.company.example:8080");
    const args = fake.record().args;
    expect(args.slice(args.indexOf("--proxy"), args.indexOf("--proxy") + 7)).toEqual([
      "--proxy",
      "http://proxy.company.example:8080",
      "--proxy-anyauth",
      "--proxy-user",
      ":",
      "--noproxy",
      "",
    ]);
    await get("direct");
    expect(fake.record().args).toEqual(expect.arrayContaining(["--noproxy", "*"]));
    expect(fake.record().args).not.toContain("--proxy");
    await get(null); // the environment's, which curl reads itself
    expect(fake.record().args).not.toContain("--proxy");
    expect(fake.record().args).not.toContain("--noproxy");
  });

  it("sends a JSON body as it is, and a GET with none", async () => {
    const fake = fakeCurl("HTTP/1.1 200 OK\r\ncontent-type: application/json\r\n\r\n{}");
    await readText(
      await curlTransport(fake.file)({
        method: "POST",
        url: "https://a.example/t",
        headers: { "content-type": "application/json" },
        json: '{"a":1}',
        signal: new AbortController().signal,
      }),
    );
    expect(fake.record().args).toEqual(expect.arrayContaining(["--data-binary", "@-"]));
    expect(fake.record().stdin).toBe('{"a":1}');
    await readText(await curlTransport(fake.file)({ method: "GET", url: "https://a.example/h", headers: {}, signal: new AbortController().signal }));
    expect(fake.record().args).not.toContain("--data-binary");
    expect(fake.record().args).not.toContain("-F");
  });

  it("says why when curl cannot reach the server, in curl's words", async () => {
    const dir = tmp();
    const file = path.join(dir, "curl");
    writeFileSync(file, "#!/bin/sh\necho 'curl: (6) Could not resolve host: chat.example.invalid' >&2\nexit 6\n", { mode: 0o755 });
    const err = await curlTransport(file)({ method: "GET", url: "https://chat.example.invalid/", headers: {}, signal: new AbortController().signal }).catch(
      (e) => e,
    );
    expect(err).toBeInstanceOf(TransportError);
    expect(err.message).toBe("Could not resolve host: chat.example.invalid (curl exit 6)");
    expect(leftovers().length).toBe(0);
  });

  it("reports a program that will not run, and stops curl when the run is cancelled", async () => {
    const err = await curlTransport("/nonexistent/curl")({ method: "GET", url: "https://a.example/", headers: {}, signal: new AbortController().signal }).catch(
      (e) => e,
    );
    expect(err).toBeInstanceOf(TransportError);
    expect(err.message).toMatch(/^could not run curl/);
    // A curl that never answers is killed with the run.
    const slow = path.join(tmp(), "curl");
    writeFileSync(slow, "#!/bin/sh\nsleep 30\n", { mode: 0o755 });
    const stop = new AbortController();
    const started = Date.now();
    const pending = curlTransport(slow)({ method: "GET", url: "https://a.example/", headers: {}, signal: stop.signal }).catch((e) => e);
    setTimeout(() => stop.abort(new Error("cancelled")), 150);
    expect(((await pending) as Error).message).toMatch(/abort|cancel/i);
    expect(Date.now() - started).toBeLessThan(5_000);
  });
});

describe("the real curl and Node's fetch against a server", () => {
  const serve = async () => {
    server = createServer(async (req, res) => {
      let body = "";
      for await (const c of req) body += c;
      res.writeHead(req.url === "/missing" ? 404 : 200, { "content-type": "text/plain" });
      res.end(`${req.method} ${req.url} ${req.headers["x-probe"] ?? ""} ${/name="data"[\s\S]*olá/.test(body) ? "form-ok" : ""}`);
    });
    await new Promise<void>((r) => server!.listen(0, "127.0.0.1", () => r()));
    return `http://127.0.0.1:${(server!.address() as AddressInfo).port}`;
  };

  it.skipIf(!findCurl())("both make the same request and read the same answer", async () => {
    const base = await serve();
    for (const send of [curlTransport(findCurl()!), fetchTransport]) {
      const form = await send({
        method: "POST",
        url: `${base}/chat`,
        headers: { "x-probe": "1" },
        form: { name: "data", value: '{"x":"olá"}' },
        signal: new AbortController().signal,
      });
      expect(form.status).toBe(200);
      expect(await readText(form)).toBe("POST /chat 1 form-ok");
      const missing = await send({ method: "GET", url: `${base}/missing`, headers: {}, signal: new AbortController().signal });
      expect(missing.status).toBe(404);
      await readText(missing);
    }
  });

  it("finds Windows' curl and Git's beside the one on PATH, once each", () => {
    const env = { PATH: "", SystemRoot: "C:\\Windows", ProgramFiles: "C:\\Program Files", LOCALAPPDATA: "C:\\Users\\x\\AppData\\Local" };
    const there = new Set(["C:\\Windows\\System32\\curl.exe", "C:\\Program Files\\Git\\mingw64\\bin\\curl.exe"]);
    expect(curlCandidates(env, "win32", (f) => there.has(f))).toEqual(["C:\\Windows\\System32\\curl.exe", "C:\\Program Files\\Git\\mingw64\\bin\\curl.exe"]);
    expect(curlCandidates({ PATH: "" }, "linux", () => true)).toEqual([]);
  });

  it("reads the environment's proxy for the address's scheme", () => {
    expect(envProxy("https://a.example/", { HTTPS_PROXY: "http://p:1" })).toBe("http://p:1");
    expect(envProxy("https://a.example/", { http_proxy: "http://p:2" })).toBeNull();
    expect(envProxy("http://a.example/", { http_proxy: "http://p:2" })).toBe("http://p:2");
    expect(envProxy("https://a.example/", { ALL_PROXY: "socks5h://p:3" })).toBe("socks5h://p:3");
  });

  it("chooses curl when it is installed, Node's fetch when it is not or when asked", () => {
    expect(transportFor(undefined, "/usr/bin/curl").name).toBe("curl");
    expect(transportFor("curl", "/usr/bin/curl").name).toBe("curl");
    expect(transportFor("fetch", "/usr/bin/curl").name).toBe("fetch");
    expect(transportFor(undefined, null).name).toBe("fetch");
    expect(transportFor("curl", null).name).toBe("fetch");
  });
});
