// Choosing a bot's tools (specs/web-app): Orbis's own tool groups and the MCP
// servers connected to the hub, as switches that write the bot's allowlist
// (`computer.*`, `!browser.*`, `mcp.github.*`).
import { useEffect, useState } from "react";
import { toolAllowed, type ToolInfo } from "@orbis/shared";
import type { Api } from "../api.js";
import { useT, type TextKey } from "../i18n.js";
import { useStore } from "../store.js";
import { McpLogo } from "./McpLogo.js";

interface Group {
  key: string;
  prefix: string;
  label: string;
  external: boolean;
  /** A group `*` does not give (the health data): only its own pattern does. */
  explicit?: string;
  names: string[];
  /** An MCP server's logo and emoji. */
  logo?: string | null;
  icon?: string;
}

/** Turn a group on or off in an allowlist, keeping every other pattern. */
export function setGroup(patterns: string[], group: Pick<Group, "prefix" | "external" | "names"> & { explicit?: string }, on: boolean): string[] {
  const all = `${group.prefix}*`;
  const inside = (p: string) => p.replace(/^!/, "").startsWith(group.prefix);
  const needs = group.external || group.explicit || false;
  let next = patterns.filter((p) => !inside(p) && p !== "!*");
  if (on) {
    if (!group.names.every((n) => toolAllowed(n, next.length ? next : ["!*"], needs))) next.push(all);
  } else if (group.names.some((n) => toolAllowed(n, next.length ? next : ["!*"], needs))) {
    next.push(`!${all}`);
  }
  // An empty allowlist means every tool: "nothing" is spelled `!*`.
  if (!next.some((p) => !p.startsWith("!"))) next = ["!*"];
  return next;
}

export function ToolPicker({ api, patterns, onChange }: { api: Api | null | undefined; patterns: string[]; onChange(patterns: string[]): void }) {
  const t = useT();
  const servers = useStore((s) => s.mcpServers);
  const [tools, setTools] = useState<ToolInfo[] | null>(null);
  useEffect(() => {
    if (!api) return;
    let live = true;
    api
      .get<ToolInfo[]>("/api/v1/tools")
      .then((list) => live && setTools(Array.isArray(list) ? list : []))
      .catch(() => live && setTools([]));
    return () => {
      live = false;
    };
  }, [api, Object.keys(servers).join(",")]);
  if (!tools) return null;

  const groups = new Map<string, Group>();
  for (const tool of tools) {
    const external = tool.server !== null;
    const key = external ? `mcp.${tool.server}` : tool.name.split(".")[0]!;
    const group = groups.get(key) ?? {
      key,
      prefix: `${key}.`,
      external,
      ...(tool.explicit ? { explicit: tool.explicit } : {}),
      names: [],
      label: external ? (servers[tool.server!]?.name ?? tool.server!) : t(`tools.group.${key}` as TextKey),
      ...(external ? { logo: servers[tool.server!]?.logo ?? null, icon: servers[tool.server!]?.icon ?? "🧩" } : {}),
    };
    group.names.push(tool.name);
    groups.set(key, group);
  }
  const own = [...groups.values()].filter((g) => !g.external);
  const mcp = [...groups.values()].filter((g) => g.external);
  const effective = patterns.length ? patterns : ["*"];

  const row = (group: Group) => {
    const allowed = group.names.filter((n) => toolAllowed(n, effective, group.external || group.explicit || false)).length;
    return (
      <label key={group.key} className="checkbox tool-group" data-testid={`tool-group-${group.key}`}>
        <input
          type="checkbox"
          checked={allowed === group.names.length}
          ref={(el) => {
            if (el) el.indeterminate = allowed > 0 && allowed < group.names.length;
          }}
          onChange={(e) => onChange(setGroup(effective, group, e.target.checked))}
        />
        <span className="tool-group-name">
          {group.external && <McpLogo logo={group.logo} icon={group.icon ?? "🧩"} size={22} />}
          {group.label} <span className="muted small">({group.names.length})</span>
        </span>
      </label>
    );
  };

  return (
    <div className="tool-picker">
      <p className="field-label">{t("tools.own")}</p>
      <div className="tool-groups">{own.map(row)}</div>
      <p className="field-label">{t("tools.mcp")}</p>
      {mcp.length ? <div className="tool-groups">{mcp.map(row)}</div> : <p className="muted small">{t("tools.noMcp")}</p>}
    </div>
  );
}
