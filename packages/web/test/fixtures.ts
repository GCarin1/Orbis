import type { Bot } from "@orbis/shared";

export function bot(overrides: Partial<Bot> & { name: string }): Bot {
  const handle = overrides.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return {
    id: `bot_${handle}`,
    handle,
    role: "",
    description: "",
    avatar: { initials: overrides.name.slice(0, 2).toUpperCase(), color: "#4f46e5" },
    brain: { kind: "mock" },
    reportsTo: null,
    policy: { rules: [], grants: [] },
    computer: { enabled: true },
    tools: ["*"],
    skills: ["*"],
    spendCapUsd: null,
    capIncludesSubscription: false,
    pinned: false,
    hidden: false,
    state: "idle",
    lastMessage: null,
    createdAt: "2026-09-27T10:00:00.000Z",
    updatedAt: "2026-09-27T10:00:00.000Z",
    ...overrides,
  };
}
