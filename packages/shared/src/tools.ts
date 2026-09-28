// Tool allowlists (specs/tool-gateway), shared by the hub and the apps so both
// read a bot's `tools` the same way.

export function globToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`);
}

/**
 * Whether an allowlist lets a bot use a tool: some pattern matches and no
 * `!pattern` excludes it. An external MCP tool needs a pattern that starts with
 * `mcp.` — `*` alone never hands a bot a server the user did not pick for it.
 */
export function toolAllowed(name: string, patterns: readonly string[], external = false): boolean {
  const list = patterns.length ? patterns : ["*"];
  if (list.some((p) => p.startsWith("!") && globToRegExp(p.slice(1)).test(name))) return false;
  return list.some((p) => !p.startsWith("!") && (!external || p.startsWith("mcp.")) && globToRegExp(p).test(name));
}
