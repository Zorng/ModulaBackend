import { describe, expect, it } from "@jest/globals";
import {
  normalizeRoleKey,
  normalizeUniqueBranchIds,
  parseExpiryToMs,
  sha256,
} from "../../app/common.js";

describe("v0 auth common helpers", () => {
  it("normalizes and deduplicates branch IDs", () => {
    const result = normalizeUniqueBranchIds([
      " branch-a ",
      "branch-b",
      "branch-a",
      "",
      "   ",
    ]);

    expect(result).toEqual(["branch-a", "branch-b"]);
  });

  it("normalizes role keys to uppercase", () => {
    expect(normalizeRoleKey(" cashier ")).toBe("CASHIER");
  });

  it("parses expiry units into milliseconds", () => {
    expect(parseExpiryToMs("10s")).toBe(10_000);
    expect(parseExpiryToMs("15m")).toBe(900_000);
    expect(parseExpiryToMs("2h")).toBe(7_200_000);
  });

  it("produces deterministic SHA-256 hashes", () => {
    const first = sha256("abc");
    const second = sha256("abc");

    expect(first).toBe(second);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
  });
});
