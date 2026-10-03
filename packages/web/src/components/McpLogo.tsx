// An MCP server's logo (packages/web/public/logos/mcp): the service's own mark on a light tile, so dark
// logos read in the dark theme too; its emoji when it has no logo or the file does not load.
import { useState } from "react";

export function McpLogo({ logo, icon, size = 32 }: { logo?: string | null; icon: string; size?: number }) {
  const [broken, setBroken] = useState(false);
  if (!logo || broken) {
    return (
      <span className="mcp-logo emoji" style={{ width: size, height: size, fontSize: Math.round(size * 0.6) }} aria-hidden="true">
        {icon}
      </span>
    );
  }
  return (
    <span className="mcp-logo" style={{ width: size, height: size }} aria-hidden="true">
      <img src={logo} alt="" width={size - 8} height={size - 8} loading="lazy" onError={() => setBroken(true)} />
    </span>
  );
}
