import { describe, expect, it } from "vitest";
import { rankBranches } from "../src/search/rank.js";

const names = (s: string[]) => s.map((name) => ({ name }));

describe("rankBranches", () => {
  it("returns all items in recency order for an empty query", () => {
    const items = [{ name: "a", recencyRank: 2 }, { name: "b", recencyRank: 0 }, { name: "c" }];
    const ranked = rankBranches(items, "");
    expect(ranked.map((r) => r.item.name)).toEqual(["b", "a", "c"]);
  });

  it("prefers exact over prefix over token over fuzzy", () => {
    const items = names([
      "feat/payment-retry", // token match on 'pay'
      "pay", // exact
      "payments-service", // prefix
      "xpaymentx", // subsequence only
    ]);
    const ranked = rankBranches(items, "pay");
    expect(ranked[0]!.item.name).toBe("pay");
    expect(ranked[1]!.item.name).toBe("payments-service");
    // token-boundary match should beat the pure subsequence match
    const tokenIdx = ranked.findIndex((r) => r.item.name === "feat/payment-retry");
    const subIdx = ranked.findIndex((r) => r.item.name === "xpaymentx");
    expect(tokenIdx).toBeLessThan(subIdx);
  });

  it("matches multi-token fuzzy queries like 'pay ret' via subsequence", () => {
    const items = names(["feat/payment-retry", "feat/payment-timeout", "chore/deps"]);
    const ranked = rankBranches(items, "payret");
    expect(ranked[0]!.item.name).toBe("feat/payment-retry");
  });

  it("does not let a weak fuzzy match beat an obvious prefix", () => {
    const items = names(["feature-branch", "f-e-a-t-u-r-e"]);
    const ranked = rankBranches(items, "feature");
    expect(ranked[0]!.item.name).toBe("feature-branch");
  });

  it("returns matched indices for highlighting", () => {
    const ranked = rankBranches(names(["payments"]), "pay");
    expect(ranked[0]!.matchedIndices).toEqual([0, 1, 2]);
  });

  it("excludes non-matches entirely", () => {
    const ranked = rankBranches(names(["main", "develop"]), "zzz");
    expect(ranked).toHaveLength(0);
  });
});
