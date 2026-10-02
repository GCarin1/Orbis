// How the chat-http brain makes its requests (specs/agent-runtimes): through the system's `curl`
// program or through Node's `fetch`, behind one small interface.
//
// A company chat behind a firewall such as Cloudflare answers the browser and `curl`, and refuses
// Node's own `fetch` with HTTP 403 ("Sorry, you have been blocked"): the firewall looks at how the
// client speaks (HTTP/2, the TLS handshake, the header set) and Node does not look like a browser.
// `curl` is what the owner's "Copy as cURL" runs, so the brain calls it by default.
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { resolveExecutable } from "./process.js";

export interface HttpRequest {
  method: "GET" | "POST";
  url: string;
  /** Every header, the Authorization one included; a body's `content-type` is made by the transport. */
  headers: Record<string, string>;
  /** A `multipart/form-data` body with this one text field. */
  form?: { name: string; value: string };
  /** Or a JSON body (the caller sets `content-type`). */
  json?: string;
  signal: AbortSignal;
}

export interface HttpResponse {
  status: number;
  contentType: string;
  /** The body as it arrives; it throws when the connection breaks. */
  body: AsyncIterable<Uint8Array>;
}

export type Transport = (req: HttpRequest) => Promise<HttpResponse>;

/** The request never got an answer: nothing to reach, a TLS failure, a program that would not run. */
export class TransportError extends Error {}

const readAll = async (body: AsyncIterable<Uint8Array>, limit: number): Promise<string> => {
  const decoder = new TextDecoder();
  let text = "";
  for await (const part of body) {
    text += decoder.decode(part, { stream: true });
    if (text.length >= limit) break;
  }
  return text.slice(0, limit);
};

/** The start of a response body, for a message (never more than `limit` characters). */
export const readText = (res: HttpResponse, limit = 100_000) => readAll(res.body, limit).catch(() => "");

// --- Node's fetch ----------------------------------------------------------------------------------

export const fetchTransport: Transport = async (req) => {
  let body: FormData | string | undefined;
  if (req.form) {
    body = new FormData();
    body.append(req.form.name, req.form.value);
  } else if (req.json !== undefined) body = req.json;
  let res: Response;
  try {
    res = await fetch(req.url, { method: req.method, headers: req.headers, ...(body === undefined ? {} : { body }), signal: req.signal });
  } catch (err) {
    if (req.signal.aborted) throw err;
    const cause = (err as { cause?: { code?: string; message?: string } }).cause;
    throw new TransportError(cause?.code ?? cause?.message ?? (err instanceof Error ? err.message : String(err)));
  }
  return {
    status: res.status,
    contentType: res.headers.get("content-type") ?? "",
    body: (res.body as unknown as AsyncIterable<Uint8Array> | null) ?? (async function* () {})(),
  };
};

// --- the system's curl ------------------------------------------------------------------------------

/** The `curl` program on PATH (`curl.exe` is part of Windows 10 and later), or null. */
export const findCurl = (envPath = process.env.PATH ?? ""): string | null => resolveExecutable("curl", envPath);

/**
 * The response head `curl --include` prints: the status line and headers up to the blank line.
 * `null` while the head is not complete. Interim `1xx` responses are skipped by the caller.
 */
export function parseHead(buffer: Buffer): { status: number; contentType: string; rest: Buffer } | null {
  const crlf = buffer.indexOf("\r\n\r\n");
  const lf = buffer.indexOf("\n\n");
  const end = crlf >= 0 && (lf < 0 || crlf <= lf) ? crlf : lf;
  if (end < 0) return null;
  const gap = end === crlf ? 4 : 2;
  const lines = buffer.subarray(0, end).toString("latin1").split(/\r?\n/);
  const status = Number(/^HTTP\/\S+\s+(\d{3})/.exec(lines[0] ?? "")?.[1] ?? 0);
  const type = lines.slice(1).find((l) => /^content-type\s*:/i.test(l));
  return { status, contentType: type ? type.slice(type.indexOf(":") + 1).trim() : "", rest: buffer.subarray(end + gap) };
}

/**
 * Make the request with `curl`. The headers (the token among them) go in a private temporary file,
 * not on the command line, where any program on the machine could read them; the body goes on stdin.
 * HTTP/2, the TLS stack and the system's certificate store and proxy settings are curl's own.
 */
export function curlTransport(curl: string): Transport {
  return async (req) => {
    const dir = mkdtempSync(path.join(tmpdir(), "orbis-curl-"));
    const cleanup = () => rmSync(dir, { recursive: true, force: true });
    const headerFile = path.join(dir, "headers.txt");
    writeFileSync(
      headerFile,
      `${Object.entries(req.headers)
        .map(([k, v]) => `${k}: ${v}`)
        .join("\n")}\n`,
      { mode: 0o600 },
    );
    const args = ["-q", "--silent", "--show-error", "--no-buffer", "--include", "--proto", "=http,https", "-H", `@${headerFile}`, "-H", "Expect:"];
    if (req.form) args.push("-F", `${req.form.name}=<-`);
    else if (req.json !== undefined) args.push("--data-binary", "@-");
    args.push("--url", req.url);

    const child = spawn(curl, args, { stdio: ["pipe", "pipe", "pipe"], windowsHide: true, signal: req.signal });
    let stderr = "";
    child.stderr.on("data", (d: Buffer) => (stderr = (stderr + d.toString("utf8")).slice(-2_000)));
    const exited = new Promise<number | null>((resolve) => child.on("close", (code) => resolve(code)));
    const failed = new Promise<never>((_, reject) => child.on("error", (err) => reject(err)));
    failed.catch(() => undefined);
    child.stdin.on("error", () => undefined); // curl may stop reading (a refused request) before the body is written
    child.stdin.end(req.form ? req.form.value : (req.json ?? ""), "utf8");

    const reason = async () => {
      const code = await exited;
      const line = stderr
        .trim()
        .split("\n")
        .filter(Boolean)
        .at(-1)
        ?.replace(/^curl:\s*(\(\d+\)\s*)?/, "");
      return `${line ?? "curl ended with no answer"}${code ? ` (curl exit ${code})` : ""}`;
    };
    const iterator = (child.stdout as AsyncIterable<Buffer>)[Symbol.asyncIterator]();
    try {
      let buffer: Buffer = Buffer.alloc(0);
      for (;;) {
        const head = parseHead(buffer);
        if (head && head.status >= 200) {
          const first = head.rest;
          return {
            status: head.status,
            contentType: head.contentType,
            body: (async function* () {
              try {
                if (first.length) yield first;
                for (;;) {
                  const next = await Promise.race([iterator.next(), failed]);
                  if (next.done) break;
                  yield next.value;
                }
                const code = await exited;
                if (code) throw new TransportError(`the connection broke while the answer was coming: ${await reason()}`);
              } finally {
                child.kill();
                cleanup();
              }
            })(),
          };
        }
        if (head)
          buffer = Buffer.from(head.rest); // an interim 1xx: its head is skipped
        else {
          const next = await Promise.race([iterator.next(), failed]);
          if (next.done) throw new TransportError(await reason());
          buffer = Buffer.concat([buffer, next.value]);
        }
      }
    } catch (err) {
      child.kill();
      cleanup();
      if (req.signal.aborted) throw err;
      if (err instanceof TransportError) throw err;
      throw new TransportError(`could not run curl (${err instanceof Error ? err.message : String(err)})`);
    }
  };
}

/** The transport a brain's settings ask for: curl when it is installed (unless `fetch` is asked for), else Node's fetch. */
export function transportFor(choice: "curl" | "fetch" | undefined, curl: string | null = findCurl()): { name: "curl" | "fetch"; send: Transport } {
  if (choice !== "fetch" && curl) return { name: "curl", send: curlTransport(curl) };
  return { name: "fetch", send: fetchTransport };
}
