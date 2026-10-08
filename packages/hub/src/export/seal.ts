// The secrets of an export, sealed by a password the user chooses (change 0065-export-import): scrypt turns the
// password into a key, AES-256-GCM seals the JSON. Without the password the file says only that it holds
// secrets; a wrong password or a changed byte fails to open.
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

export const MIN_EXPORT_PASSWORD = 10;
const N = 2 ** 15;
const R = 8;
const P = 1;
/** What scrypt needs for N and r, with room (Node refuses above its 32 MB default). */
const MAXMEM = 128 * N * R * 2;
const AAD = Buffer.from("orbis-export-secrets/1");

export interface Sealed {
  version: 1;
  kdf: "scrypt";
  N: number;
  r: number;
  p: number;
  salt: string;
  iv: string;
  tag: string;
  data: string;
}

export class WrongPassword extends Error {}

function key(password: string, salt: Buffer, n: number, r: number, p: number): Buffer {
  return scryptSync(password.normalize("NFKC"), salt, 32, { N: n, r, p, maxmem: Math.max(MAXMEM, 128 * n * r * 2) });
}

export function seal(value: unknown, password: string): Sealed {
  if (password.length < MIN_EXPORT_PASSWORD) throw new Error(`the export password needs at least ${MIN_EXPORT_PASSWORD} characters`);
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(password, salt, N, R, P), iv);
  cipher.setAAD(AAD);
  const data = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return { version: 1, kdf: "scrypt", N, r: R, p: P, salt: salt.toString("base64"), iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), data: data.toString("base64") };
}

export function unseal<T>(sealed: Sealed, password: string): T {
  if (sealed.version !== 1 || sealed.kdf !== "scrypt") throw new Error("the export's secrets are sealed in a way this hub does not read");
  // Bounds on what the file asks of scrypt, so a crafted file cannot make the hub spend gigabytes.
  if (sealed.N > 2 ** 17 || sealed.r > 16 || sealed.p > 4) throw new Error("the export's secrets ask too much of the hub to open");
  try {
    const decipher = createDecipheriv("aes-256-gcm", key(password, Buffer.from(sealed.salt, "base64"), sealed.N, sealed.r, sealed.p), Buffer.from(sealed.iv, "base64"));
    decipher.setAAD(AAD);
    decipher.setAuthTag(Buffer.from(sealed.tag, "base64"));
    const plain = Buffer.concat([decipher.update(Buffer.from(sealed.data, "base64")), decipher.final()]);
    return JSON.parse(plain.toString("utf8")) as T;
  } catch {
    throw new WrongPassword("the export password is wrong, or its secrets were changed");
  }
}
