// Runs inside the bot's browser page (plain JavaScript: the hub compiles without
// DOM types). Tags links, fields and buttons with `data-orbis-ref` so later
// actions can target them, and reads what a person would see. Returns a
// PageSnapshot (see browser.ts).
export const READ_PAGE = `(() => {
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
  };
  const clean = (t, n = 80) => (t || "").replace(/\\s+/g, " ").trim().slice(0, n);
  document.querySelectorAll("[data-orbis-ref]").forEach((e) => e.removeAttribute("data-orbis-ref"));
  const links = [], fields = [], buttons = [];
  for (const a of document.querySelectorAll("a[href]")) {
    if (links.length >= 80 || !visible(a)) continue;
    const ref = "l" + (links.length + 1);
    a.setAttribute("data-orbis-ref", ref);
    links.push({ ref, text: clean(a.innerText || a.getAttribute("aria-label")), href: a.href });
  }
  const buttonTypes = new Set(["submit", "button", "reset", "image"]);
  for (const el of document.querySelectorAll("input, textarea, select")) {
    if (fields.length >= 60 || el.type === "hidden" || buttonTypes.has(el.type) || !visible(el)) continue;
    const ref = "f" + (fields.length + 1);
    el.setAttribute("data-orbis-ref", ref);
    const label = clean((el.labels && el.labels[0] && el.labels[0].innerText) || el.getAttribute("aria-label") || el.placeholder || el.name || el.id);
    const kind = el.tagName === "INPUT" ? "input:" + (el.type || "text") : el.tagName.toLowerCase();
    const value = el.type === "password" ? (el.value ? "••••" : "") : clean(el.value, 60);
    fields.push({ ref, kind, label, value });
  }
  for (const el of document.querySelectorAll("button, [role=button], input[type=submit], input[type=button]")) {
    if (buttons.length >= 60 || !visible(el)) continue;
    const ref = "b" + (buttons.length + 1);
    el.setAttribute("data-orbis-ref", ref);
    buttons.push({ ref, text: clean(el.innerText || el.value || el.getAttribute("aria-label")) });
  }
  const text = document.body ? document.body.innerText : "";
  const head = text.slice(0, 6000);
  return {
    title: document.title,
    url: location.href,
    text,
    links,
    fields,
    buttons,
    password: Boolean(document.querySelector("input[type=password]")),
    captcha: Boolean(document.querySelector(
      'iframe[src*="recaptcha"], iframe[src*="hcaptcha"], iframe[src*="turnstile"], iframe[src*="captcha"], .g-recaptcha, .h-captcha, .cf-turnstile, [id*="captcha" i], [class*="captcha" i]'
    )),
    otp: Boolean(document.querySelector('input[autocomplete="one-time-code"]')) ||
      /verification code|two-factor|2-step verification|authenticator app|código de verificação|verificação em duas etapas/i.test(head),
  };
})()`;
