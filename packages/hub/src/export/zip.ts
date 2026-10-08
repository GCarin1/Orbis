// A small ZIP writer and reader for `.orbis` exports (change 0065-export-import): deflated entries, CRC-32,
// no ZIP64 and no encryption, which every unzip tool opens. The reader takes only what this writer makes
// and refuses the rest: absolute or `..` paths, sizes past the limits, entries that do not inflate to their
// size and CRC.
import { crc32, deflateRawSync, inflateRawSync } from "node:zlib";

export interface ZipEntry {
  path: string;
  data: Buffer;
}

/** Past these the reader refuses the archive (a file of 25 MB at most, an export of 1 GB). */
export const MAX_ENTRY_BYTES = 64 * 1024 * 1024;
export const MAX_TOTAL_BYTES = 1024 * 1024 * 1024;
export const MAX_ENTRIES = 200_000;

export class ZipError extends Error {}

/** MS-DOS time and date of a moment (what ZIP headers carry). */
function dosTime(at: Date): { time: number; date: number } {
  return {
    time: (at.getHours() << 11) | (at.getMinutes() << 5) | Math.floor(at.getSeconds() / 2),
    date: ((Math.max(at.getFullYear(), 1980) - 1980) << 9) | ((at.getMonth() + 1) << 5) | at.getDate(),
  };
}

export function safePath(p: string): boolean {
  return p.length > 0 && p.length < 512 && !p.startsWith("/") && !p.includes("\\") && !p.includes("\0") && p.split("/").every((s) => s !== "" && s !== "." && s !== "..");
}

export function writeZip(entries: ZipEntry[], at = new Date()): Buffer {
  const { time, date } = dosTime(at);
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    if (!safePath(entry.path)) throw new ZipError(`not a safe path in an archive: ${entry.path}`);
    const name = Buffer.from(entry.path, "utf8");
    const deflated = deflateRawSync(entry.data);
    // Already-compressed data (images, archives) is kept as it is.
    const stored = deflated.length >= entry.data.length;
    const body = stored ? entry.data : deflated;
    const crc = crc32(entry.data) >>> 0;
    const method = stored ? 0 : 8;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, name, body);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(entry.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);
    offset += local.length + name.length + body.length;
    if (offset > 0xffffffff) throw new ZipError("the export is larger than 4 GB");
  }
  const centralSize = centrals.reduce((n, b) => n + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  if (entries.length > 0xffff) throw new ZipError("the export has more than 65,535 parts");
  return Buffer.concat([...locals, ...centrals, end]);
}

export function readZip(zip: Buffer): ZipEntry[] {
  // The end record is in the last 22 bytes (this writer adds no comment), or up to 64 KB before for others.
  let end = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 22 - 0xffff); i--) {
    if (zip.readUInt32LE(i) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new ZipError("not a .orbis file (no ZIP directory)");
  const count = zip.readUInt16LE(end + 10);
  const centralSize = zip.readUInt32LE(end + 12);
  let p = zip.readUInt32LE(end + 16);
  if (count > MAX_ENTRIES || p + centralSize > end) throw new ZipError("the file's directory is damaged");
  const entries: ZipEntry[] = [];
  let total = 0;
  for (let n = 0; n < count; n++) {
    if (p + 46 > zip.length || zip.readUInt32LE(p) !== 0x02014b50) throw new ZipError("the file's directory is damaged");
    const flags = zip.readUInt16LE(p + 8);
    const method = zip.readUInt16LE(p + 10);
    const crc = zip.readUInt32LE(p + 16);
    const compressed = zip.readUInt32LE(p + 20);
    const size = zip.readUInt32LE(p + 24);
    const nameLength = zip.readUInt16LE(p + 28);
    const extra = zip.readUInt16LE(p + 30);
    const comment = zip.readUInt16LE(p + 32);
    const localAt = zip.readUInt32LE(p + 42);
    const name = zip.subarray(p + 46, p + 46 + nameLength).toString("utf8");
    p += 46 + nameLength + extra + comment;
    if (flags & 0x1) throw new ZipError(`${name}: encrypted parts are not read`);
    if (name.endsWith("/")) continue; // a folder
    if (!safePath(name)) throw new ZipError(`${name}: not a safe path`);
    if (size > MAX_ENTRY_BYTES || compressed > MAX_ENTRY_BYTES) throw new ZipError(`${name}: larger than ${MAX_ENTRY_BYTES} bytes`);
    total += size;
    if (total > MAX_TOTAL_BYTES) throw new ZipError("the export is larger than the hub takes");
    if (localAt + 30 > zip.length || zip.readUInt32LE(localAt) !== 0x04034b50) throw new ZipError(`${name}: damaged`);
    const start = localAt + 30 + zip.readUInt16LE(localAt + 26) + zip.readUInt16LE(localAt + 28);
    const body = zip.subarray(start, start + compressed);
    if (body.length !== compressed) throw new ZipError(`${name}: cut short`);
    let data: Buffer;
    if (method === 0) data = Buffer.from(body);
    else if (method === 8) {
      try {
        data = inflateRawSync(body, { maxOutputLength: Math.max(size, 1) });
      } catch {
        throw new ZipError(`${name}: does not inflate`);
      }
    } else throw new ZipError(`${name}: compression ${method} is not read`);
    if (data.length !== size || (crc32(data) >>> 0) !== crc) throw new ZipError(`${name}: its checksum does not match`);
    entries.push({ path: name, data });
  }
  return entries;
}
