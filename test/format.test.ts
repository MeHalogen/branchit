import { describe, expect, it } from "vitest";
import { slugify } from "../src/screens/NewBranch.js";
import {
  abbreviateHome,
  middleTruncate,
  relativeTime,
  repoNameFromRoot,
  sanitizeForDisplay,
} from "../src/utils/format.js";

describe("relativeTime", () => {
  const now = new Date("2024-06-01T12:00:00Z");
  it("formats seconds/minutes/hours/days", () => {
    expect(relativeTime("2024-06-01T11:59:30Z", now)).toBe("30s");
    expect(relativeTime("2024-06-01T11:30:00Z", now)).toBe("30m");
    expect(relativeTime("2024-06-01T09:00:00Z", now)).toBe("3h");
    expect(relativeTime("2024-05-29T12:00:00Z", now)).toBe("3d");
  });
  it("returns empty for invalid input", () => {
    expect(relativeTime("", now)).toBe("");
    expect(relativeTime("not-a-date", now)).toBe("");
  });
});

describe("middleTruncate", () => {
  it("keeps head and tail of long names", () => {
    const out = middleTruncate("feat/enterprise-payment-orchestration-retry", 24);
    expect(out.length).toBe(24);
    expect(out).toContain("…");
    expect(out.startsWith("feat/")).toBe(true);
    expect(out.endsWith("retry")).toBe(true);
  });
  it("returns short strings unchanged", () => {
    expect(middleTruncate("main", 20)).toBe("main");
  });
});

describe("sanitizeForDisplay", () => {
  const ESC = String.fromCharCode(27);
  const BELL = String.fromCharCode(7);
  it("strips ANSI escape and control sequences", () => {
    const malicious = `feat/x${ESC}[31mRED${ESC}[0m${BELL}`;
    const clean = sanitizeForDisplay(malicious);
    expect(clean).not.toContain(ESC);
    expect(clean).not.toContain(BELL);
    expect(clean.startsWith("feat/x")).toBe(true);
  });
  it("removes newlines so metadata stays one line", () => {
    expect(sanitizeForDisplay("a\nb")).toBe("ab");
  });
});

describe("repoNameFromRoot", () => {
  it("returns the final path segment", () => {
    expect(repoNameFromRoot("/Users/me/work/payments-api")).toBe("payments-api");
  });
});

describe("abbreviateHome", () => {
  it("replaces the home prefix with ~", () => {
    expect(abbreviateHome("/Users/me/work/x", "/Users/me")).toBe("~/work/x");
    expect(abbreviateHome("/opt/x", "/Users/me")).toBe("/opt/x");
  });
});

describe("slugify", () => {
  it("produces branch-safe segments", () => {
    expect(slugify("Payment  Retry Logic!")).toBe("payment-retry-logic");
    expect(slugify("  --already--slug--  ")).toBe("already-slug");
    expect(slugify("PAY-184 fix")).toBe("pay-184-fix");
  });
});
