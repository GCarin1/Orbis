// Pack PNG images into one Windows .ico (Vista and later keep PNG data inside the container).
// Used by make-ico.mjs; kept apart so it can be tested without a browser.

/** `images`: `[{ size, png }]` with `size` in pixels (1 to 256) and `png` a Buffer. */
export function packIco(images) {
  if (images.length === 0) throw new Error("an .ico needs at least one image");
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4);
  const entries = Buffer.alloc(16 * images.length);
  let offset = header.length + entries.length;
  images.forEach(({ size, png }, i) => {
    if (!Number.isInteger(size) || size < 1 || size > 256) throw new Error(`icon size ${size} is not between 1 and 256`);
    const at = i * 16;
    entries.writeUInt8(size === 256 ? 0 : size, at); // width: 0 means 256
    entries.writeUInt8(size === 256 ? 0 : size, at + 1);
    entries.writeUInt16LE(1, at + 4); // colour planes
    entries.writeUInt16LE(32, at + 6); // bits per pixel
    entries.writeUInt32LE(png.length, at + 8);
    entries.writeUInt32LE(offset, at + 12);
    offset += png.length;
  });
  return Buffer.concat([header, entries, ...images.map((image) => image.png)]);
}
