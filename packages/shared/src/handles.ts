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

/** The avatar palette: brown, red, orange, amber, green, teal, blue, violet, pink, gray. */
export const AVATAR_COLORS = [
  "#8b5e3c",
  "#ef4444",
  "#f97316",
  "#f59e0b",
  "#22c55e",
  "#14b8a6",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#6b7280",
] as const;

/** The avatar shapes; `orb` is the Orbis planet with its orbit ring. */
export const AVATAR_SHAPES = ["orb", "blob", "square", "pill", "triangle", "hexagon", "cloud", "drop"] as const;
export type AvatarShape = (typeof AVATAR_SHAPES)[number];

/** 32-bit FNV-1a hash of a label, case-insensitive. */
function hashOf(label: string): number {
  let hash = 0x811c9dc5;
  for (const ch of label.toLowerCase()) {
    hash ^= ch.codePointAt(0)!;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

/** Deterministic color from a label (the bot's role). */
export function colorFor(label: string): string {
  return AVATAR_COLORS[hashOf(label) % AVATAR_COLORS.length]!;
}

/** Deterministic shape from a label (the bot's name), so a new team does not look alike. */
export function shapeFor(label: string): AvatarShape {
  return AVATAR_SHAPES[(hashOf(label) >>> 4) % AVATAR_SHAPES.length]!;
}

export function isAvatarShape(value: unknown): value is AvatarShape {
  return typeof value === "string" && (AVATAR_SHAPES as readonly string[]).includes(value);
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

/** A role as a mention: "Customer Support" → `customer-support` (same rules as handles). */
export function roleSlug(role: string): string | null {
  const trimmed = role.trim();
  if (!trimmed) return null;
  const slug = slugifyHandle(trimmed);
  return slug === "bot" && !/^bot$/i.test(trimmed) ? null : slug;
}

/**
 * The bots a list of mentions names: a handle names that bot; a mention that is
 * no handle names every bot whose role slug matches it (`@qa`, `@designer`); a
 * mention that is neither names the bot an alias points to (a squad's handle
 * names its representative, specs/squads).
 */
export function resolveMentions<T extends { id?: string; handle: string; role: string }>(
  mentions: string[],
  bots: readonly T[],
  aliases: Readonly<Record<string, string>> = {},
): T[] {
  const out: T[] = [];
  const add = (bot: T) => {
    if (!out.includes(bot)) out.push(bot);
  };
  for (const mention of mentions) {
    const byHandle = bots.find((b) => b.handle === mention);
    if (byHandle) {
      add(byHandle);
      continue;
    }
    const byRole = bots.filter((b) => roleSlug(b.role) === mention);
    byRole.forEach(add);
    if (byRole.length) continue;
    const alias = aliases[mention];
    const aliased = alias ? bots.find((b) => b.id === alias || b.handle === alias) : undefined;
    if (aliased) add(aliased);
  }
  return out;
}
