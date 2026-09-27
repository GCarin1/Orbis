import { randomBytes } from "node:crypto";

let lastTime = 0;
let counter = 0;

/**
 * A sortable id: `<prefix>_<time base36, 9 chars><counter base36, 3 chars><random, 8 chars>`.
 * Ids created later in the same process sort after earlier ones.
 */
export function newId(prefix: string): string {
  const now = Date.now();
  if (now === lastTime) {
    counter += 1;
  } else {
    lastTime = now;
    counter = 0;
  }
  const time = now.toString(36).padStart(9, "0");
  const seq = (counter % 46656).toString(36).padStart(3, "0");
  const rand = randomBytes(6).toString("base64url").toLowerCase().replace(/[^a-z0-9]/g, "0").slice(0, 8);
  return `${prefix}_${time}${seq}${rand}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}
