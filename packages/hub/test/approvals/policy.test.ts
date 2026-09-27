// specs/approvals — acceptance criterion 1 (the precedence table).
import { describe, expect, it } from "vitest";
import type { Policy } from "@orbis/shared";
import { decide } from "../../src/approvals/policy.js";

const p = (rules: Policy["rules"], grants: string[] = []): Policy => ({ rules, grants });

describe("policy", () => {
  it.each([
    // [case, policy, tool, default, expected decision, expected source]
    ["tool default allow", p([]), "http.fetch", "allow", "allow", "default"],
    ["tool default ask", p([]), "computer.shell", "ask", "ask", "default"],
    ["plain allow rule beats an ask default", p([{ tool: "computer.shell", decision: "allow" }]), "computer.shell", "ask", "allow", "rule-allow"],
    ["plain ask rule beats plain allow rule", p([{ tool: "computer.*", decision: "allow" }, { tool: "computer.shell", decision: "ask" }]), "computer.shell", "allow", "ask", "rule-ask"],
    ["plain deny beats plain ask", p([{ tool: "computer.shell", decision: "ask" }, { tool: "computer.*", decision: "deny" }]), "computer.shell", "allow", "deny", "rule-deny"],
    ["grant beats plain deny and ask", p([{ tool: "computer.shell", decision: "deny" }], ["computer.shell"]), "computer.shell", "ask", "allow", "grant"],
    ["locked ask beats an allow-always grant", p([{ tool: "draft.*", decision: "ask", locked: true }], ["draft.create"]), "draft.create", "allow", "ask", "locked-ask"],
    ["locked deny beats everything", p([{ tool: "*", decision: "ask", locked: true }, { tool: "http.fetch", decision: "deny", locked: true }], ["http.fetch"]), "http.fetch", "allow", "deny", "locked-deny"],
    ["wildcard matches by glob only", p([{ tool: "computer.*", decision: "deny" }]), "computerx", "allow", "allow", "default"],
  ] as const)("%s", (_name, policy, tool, def, decision, source) => {
    const verdict = decide(policy, tool, def);
    expect(verdict.decision).toBe(decision);
    expect(verdict.source).toBe(source);
  });
});
