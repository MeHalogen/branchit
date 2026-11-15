import { describe, expect, it } from "vitest";
import { buildCompareUrl, parseRemoteUrl } from "../src/git/host.js";
import type { UpstreamInfo } from "../src/git/models.js";
import { computePrReadiness } from "../src/workflows/pr.js";

describe("parseRemoteUrl", () => {
  it("parses SSH scp-style GitHub remotes", () => {
    const id = parseRemoteUrl("git@github.com:acme/payments.git")!;
    expect(id.host).toBe("github");
    expect(id.owner).toBe("acme");
    expect(id.repo).toBe("payments");
    expect(id.webBase).toBe("https://github.com/acme/payments");
  });
  it("parses HTTPS GitHub remotes with credentials", () => {
    const id = parseRemoteUrl("https://user@github.com/acme/payments.git")!;
    expect(id.webBase).toBe("https://github.com/acme/payments");
  });
  it("parses ssh:// URLs and GitLab hosts", () => {
    const id = parseRemoteUrl("ssh://git@gitlab.com/acme/web.git")!;
    expect(id.host).toBe("gitlab");
    expect(id.repo).toBe("web");
  });
  it("returns null for unparseable input", () => {
    expect(parseRemoteUrl("not a url")).toBeNull();
  });
});

describe("buildCompareUrl", () => {
  const gh = parseRemoteUrl("git@github.com:acme/payments.git")!;
  it("builds a GitHub compare URL", () => {
    expect(buildCompareUrl(gh, "main", "feat/x")).toBe(
      "https://github.com/acme/payments/compare/main...feat%2Fx?expand=1",
    );
  });
  it("builds a GitLab MR URL", () => {
    const gl = parseRemoteUrl("git@gitlab.com:acme/web.git")!;
    const url = buildCompareUrl(gl, "main", "feat/x")!;
    expect(url).toContain("/-/merge_requests/new");
    expect(url).toContain("source_branch");
  });
  it("returns null for unknown hosts", () => {
    const other = parseRemoteUrl("git@example.com:acme/x.git")!;
    expect(buildCompareUrl(other, "main", "feat")).toBeNull();
  });
});

const upstream = (o: Partial<UpstreamInfo>): UpstreamInfo => ({
  ref: "origin/feat/x",
  remoteName: "origin",
  ahead: 0,
  behind: 0,
  gone: false,
  ...o,
});

describe("computePrReadiness", () => {
  it("flags a ready branch: clean, ahead, upstream, pushed", () => {
    const r = computePrReadiness({
      head: "feat/x",
      base: "main",
      isClean: true,
      upstream: upstream({ ahead: 0 }),
      aheadOfBase: 3,
      behindBase: 0,
      hasRemote: true,
    });
    expect(r.items.every((i) => i.ok)).toBe(true);
    expect(r.unpushed).toBe(0);
  });

  it("counts unpushed commits from the upstream ahead value", () => {
    const r = computePrReadiness({
      head: "feat/x",
      base: "main",
      isClean: true,
      upstream: upstream({ ahead: 2 }),
      aheadOfBase: 5,
      behindBase: 0,
      hasRemote: true,
    });
    expect(r.unpushed).toBe(2);
    expect(r.items.find((i) => i.label.includes("not pushed"))!.ok).toBe(false);
  });

  it("treats a missing upstream as needing one, unpushed = ahead of base", () => {
    const r = computePrReadiness({
      head: "feat/x",
      base: "main",
      isClean: true,
      upstream: null,
      aheadOfBase: 4,
      behindBase: 0,
      hasRemote: true,
    });
    expect(r.hasUpstream).toBe(false);
    expect(r.unpushed).toBe(4);
    expect(r.items.find((i) => i.label.includes("No upstream"))!.ok).toBe(false);
  });

  it("warns when behind the base", () => {
    const r = computePrReadiness({
      head: "feat/x",
      base: "main",
      isClean: true,
      upstream: upstream({}),
      aheadOfBase: 1,
      behindBase: 2,
      hasRemote: true,
    });
    expect(r.behindBase).toBe(2);
    expect(r.items.find((i) => i.label.includes("behind"))!.ok).toBe(false);
  });

  it("warns when the working tree is dirty and when nothing is ahead", () => {
    const r = computePrReadiness({
      head: "feat/x",
      base: "main",
      isClean: false,
      upstream: upstream({}),
      aheadOfBase: 0,
      behindBase: 0,
      hasRemote: true,
    });
    expect(r.items[0]!.ok).toBe(false); // dirty
    expect(r.items[1]!.ok).toBe(false); // nothing ahead
  });
});
