// The deterministic policy of specs/approvals (ADR 0006): a pure function.
import type { Policy, PolicyDecision, PolicyRule } from "@orbis/shared";
import { globToRegExp } from "../tools/registry.js";

export type DecisionSource = "locked-deny" | "locked-ask" | "grant" | "rule-deny" | "rule-ask" | "rule-allow" | "default";

export interface PolicyVerdict {
  decision: PolicyDecision;
  source: DecisionSource;
  rule?: PolicyRule;
}

const matches = (rule: PolicyRule, tool: string) => globToRegExp(rule.tool).test(tool);

/**
 * First match wins, in this fixed order: locked deny, locked ask, "allow
 * always" grants, the bot's deny, ask and allow rules, the tool's default.
 */
export function decide(policy: Policy, tool: string, defaultDecision: Exclude<PolicyDecision, "deny"> = "allow"): PolicyVerdict {
  const rules = policy.rules ?? [];
  const find = (decision: PolicyDecision, locked: boolean) =>
    rules.find((r) => r.decision === decision && Boolean(r.locked) === locked && matches(r, tool));

  const lockedDeny = find("deny", true);
  if (lockedDeny) return { decision: "deny", source: "locked-deny", rule: lockedDeny };
  const lockedAsk = find("ask", true);
  if (lockedAsk) return { decision: "ask", source: "locked-ask", rule: lockedAsk };
  // A locked allow is still an allow: it only sits below the locked deny/ask.
  if ((policy.grants ?? []).some((g) => globToRegExp(g).test(tool))) return { decision: "allow", source: "grant" };
  const deny = rules.find((r) => r.decision === "deny" && matches(r, tool));
  if (deny) return { decision: "deny", source: "rule-deny", rule: deny };
  const ask = rules.find((r) => r.decision === "ask" && matches(r, tool));
  if (ask) return { decision: "ask", source: "rule-ask", rule: ask };
  const allow = rules.find((r) => r.decision === "allow" && matches(r, tool));
  if (allow) return { decision: "allow", source: "rule-allow", rule: allow };
  return { decision: defaultDecision, source: "default" };
}
