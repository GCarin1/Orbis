// Handle, initials, color and mention helpers (specs/bots, specs/conversations).

export const HANDLE_PATTERN = /^[a-z0-9-]{2,32}$/;
export const RESERVED_HANDLES = new Set(["everyone"]);

export function isValidHandle(handle: string): boolean {
  return HANDLE_PATTERN.test(handle) && !RESERVED_HANDLES.has(handle);
}

/** Lowercase ASCII slug of a name, 2 to 32 characters from [a-z0-9-]. */
export function slugifyHandle(name: string): string {
  const slug = name
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32)
    .replace(/-+$/g, "");
  if (slug.length >= 2 && !RESERVED_HANDLES.has(slug)) return slug;
  if (slug.length === 1) return `${slug}-bot`;
  return "bot";
}

/** A free handle derived from `base`, appending -2, -3, ... when taken. */
export function uniqueHandle(base: string, taken: (handle: string) => boolean): string {
  if (!taken(base)) return base;
  for (let n = 2; n < 10_000; n++) {
    const suffix = `-${n}`;
    const candidate = `${base.slice(0, 32 - suffix.length).replace(/-+$/g, "")}${suffix}`;
    if (!taken(candidate)) return candidate;
  }
  throw new Error(`no free handle for ${base}`);
}

export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return Array.from(words[0]!).slice(0, 2).join("").toUpperCase();
  return (Array.from(words[0]!)[0]! + Array.from(words[1]!)[0]!).toUpperCase();
}

/** Colors with at least 4.5:1 contrast against white text. */
export const AVATAR_COLORS = [
  "#2563eb",
  "#7c3aed",
  "#c026d3",
  "#db2777",
  "#dc2626",
  "#c2410c",
  "#a16207",
  "#15803d",
  "#0f766e",
  "#0e7490",
  "#4f46e5",
  "#475569",
] as const;

/** Deterministic color from a label (the bot's role), via a 32-bit FNV-1a hash. */
export function colorFor(label: string): string {
  let hash = 0x811c9dc5;
  for (const ch of label.toLowerCase()) {
    hash ^= ch.codePointAt(0)!;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]!;
}

const MENTION = /(^|[^a-z0-9_@.-])@([a-z0-9-]{2,32})(?![a-z0-9-])/gi;

/** Handles mentioned in a text as `@handle`, lowercased, de-duplicated, in order. */
export function extractMentions(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(MENTION)) {
    const handle = m[2]!.toLowerCase();
    if (!out.includes(handle)) out.push(handle);
  }
  return out;
}
