import { describe, expect, it } from "vitest";
import {
  colorFor,
  extractMentions,
  initialsOf,
  isValidHandle,
  slugifyHandle,
  uniqueHandle,
  AVATAR_COLORS,
} from "../src/index.js";

describe("handles", () => {
  it("slugifies names into 2..32 lowercase characters", () => {
    expect(slugifyHandle("Ana Líder de QA")).toBe("ana-lider-de-qa");
    expect(slugifyHandle("  Engineer   Bot!! ")).toBe("engineer-bot");
    expect(slugifyHandle("X")).toBe("x-bot");
    expect(slugifyHandle("✨")).toBe("bot");
    expect(slugifyHandle("Everyone")).toBe("bot");
    expect(slugifyHandle("a".repeat(50))).toHaveLength(32);
  });

  it("validates handles and reserves everyone", () => {
    expect(isValidHandle("qa-bot")).toBe(true);
    expect(isValidHandle("A")).toBe(false);
    expect(isValidHandle("a")).toBe(false);
    expect(isValidHandle("everyone")).toBe(false);
    expect(isValidHandle("with space")).toBe(false);
  });

  it("appends numeric suffixes when a handle is taken", () => {
    const taken = new Set(["ana", "ana-2"]);
    expect(uniqueHandle("ana", (h) => taken.has(h))).toBe("ana-3");
    expect(uniqueHandle("bob", (h) => taken.has(h))).toBe("bob");
  });

  it("derives initials from one or two words", () => {
    expect(initialsOf("Ana Souza")).toBe("AS");
    expect(initialsOf("engineer")).toBe("EN");
    expect(initialsOf("")).toBe("?");
  });

  it("derives a stable color from the role", () => {
    expect(colorFor("QA")).toBe(colorFor("qa"));
    expect(AVATAR_COLORS).toContain(colorFor("Engineering"));
  });

  it("extracts mentions in order without duplicates", () => {
    expect(extractMentions("@ana please ask @bob-2 and @ana again; mail a@b.com")).toEqual(["ana", "bob-2"]);
    expect(extractMentions("hey @everyone")).toEqual(["everyone"]);
  });
});
