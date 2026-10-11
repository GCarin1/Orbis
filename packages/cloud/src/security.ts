// What every answer of the Orbis cloud carries (change 0068-cloud-relay, specs/cloud): the page may load only
// its own files, talk only to its own origin and the account's Supabase project, and never be framed.

/** The one inline script of the web app's index.html (the saved theme before the first paint). */
export const THEME_SCRIPT_HASH = "sha256-9MqPMnCy9kWHd4wGcT6oCIVQWJrrRDNdu+EOjmaKrrI=";

export function contentSecurityPolicy(supabaseUrl: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' '${THEME_SCRIPT_HASH}'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    "font-src 'self' data:",
    `connect-src 'self' ${supabaseUrl}`,
    "frame-src 'self'",
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

/** The answer with the cloud's security headers; a file of the hub keeps its own stricter policy. */
export function secure(res: Response, supabaseUrl: string): Response {
  // A WebSocket's upgrade answer cannot be copied.
  if (res.status === 101) return res;
  const out = new Response(res.body, res);
  const h = out.headers;
  h.set("strict-transport-security", "max-age=63072000; includeSubDomains");
  h.set("x-content-type-options", "nosniff");
  h.set("x-frame-options", "DENY");
  h.set("referrer-policy", "no-referrer");
  h.set("permissions-policy", "camera=(), geolocation=(), microphone=(self)");
  h.set("cross-origin-opener-policy", "same-origin");
  if (!h.has("content-security-policy")) h.set("content-security-policy", contentSecurityPolicy(supabaseUrl));
  h.delete("server");
  h.delete("x-powered-by");
  return out;
}

export function errorJson(status: number, code: string, message: string): Response {
  return new Response(JSON.stringify({ error: { code, message } }), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}
