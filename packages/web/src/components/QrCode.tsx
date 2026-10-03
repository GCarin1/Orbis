// A QR code drawn as one SVG path (specs/web-app): the pairing link a phone's camera or the Android app reads.
import { useMemo } from "react";
import { encode } from "uqr";

/** The dark modules of a QR code as a path, one unit per module, the quiet zone included. */
export function qrPath(text: string): { size: number; d: string } {
  const qr = encode(text, { ecc: "M", border: 4 });
  let d = "";
  qr.data.forEach((row, y) =>
    row.forEach((dark, x) => {
      if (dark) d += `M${x} ${y}h1v1h-1z`;
    }),
  );
  return { size: qr.size, d };
}

export function QrCode({ text, label, size = 224 }: { text: string; label: string; size?: number }) {
  const { size: modules, d } = useMemo(() => qrPath(text), [text]);
  return (
    <svg className="qr-code" role="img" aria-label={label} viewBox={`0 0 ${modules} ${modules}`} width={size} height={size} shapeRendering="crispEdges">
      {/* Always dark on white, in both themes: a camera reads it best that way. */}
      <rect width={modules} height={modules} fill="#fff" />
      <path d={d} fill="#000" />
    </svg>
  );
}
