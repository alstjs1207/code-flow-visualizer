import { describe, it, expect } from "vitest";
import { extractDomainGroup, groupHandlers } from "@/lib/handler-group";
import type { HandlerEntry } from "@/types";

describe("extractDomainGroup", () => {
  it("skips /api/b2e prefix and returns domain", () => {
    expect(extractDomainGroup("/api/b2e/member/sign-up")).toBe("member");
  });

  it("skips /api/backoffice prefix and returns domain", () => {
    expect(extractDomainGroup("/api/backoffice/order/:id")).toBe("order");
  });

  it("handles simple path without prefix", () => {
    expect(extractDomainGroup("/member")).toBe("member");
  });

  it("skips multiple known prefixes", () => {
    expect(extractDomainGroup("/api/v1/b2e/product/list")).toBe("product");
  });

  it("skips versioned prefix like v2", () => {
    expect(extractDomainGroup("/api/v2/external/payment/refund")).toBe(
      "payment"
    );
  });

  it("returns 'other' for root-only path", () => {
    expect(extractDomainGroup("/")).toBe("other");
  });

  it("returns 'other' when all segments are known prefixes", () => {
    expect(extractDomainGroup("/api/v1")).toBe("other");
  });

  it("lowercases the group name", () => {
    expect(extractDomainGroup("/api/Member/details")).toBe("member");
  });

  it("skips path parameters starting with :", () => {
    expect(extractDomainGroup("/:tenantId/account/balance")).toBe("account");
  });
});

describe("groupHandlers", () => {
  const makeHandler = (
    id: string,
    path: string,
    method = "GET" as const
  ): HandlerEntry => ({
    id,
    method,
    path,
    functionName: `fn_${id}`,
    file: `src/${id}.ts`,
    serviceRefs: [],
    complexity: 0,
  });

  it("groups handlers by domain", () => {
    const handlers = [
      makeHandler("1", "/api/b2e/member/sign-up", "POST"),
      makeHandler("2", "/api/b2e/member/profile"),
      makeHandler("3", "/api/b2e/order/list"),
      makeHandler("4", "/api/b2e/order/:id"),
    ];

    const groups = groupHandlers(handlers);

    expect(groups.size).toBe(2);
    expect(groups.get("member")?.length).toBe(2);
    expect(groups.get("order")?.length).toBe(2);
  });

  it("returns groups sorted alphabetically", () => {
    const handlers = [
      makeHandler("1", "/api/order/list"),
      makeHandler("2", "/api/account/balance"),
      makeHandler("3", "/api/member/profile"),
    ];

    const groups = groupHandlers(handlers);
    const keys = [...groups.keys()];

    expect(keys).toEqual(["account", "member", "order"]);
  });

  it("handles empty input", () => {
    const groups = groupHandlers([]);
    expect(groups.size).toBe(0);
  });

  it("groups unrecognized paths under 'other'", () => {
    const handlers = [makeHandler("1", "/api/v1")];
    const groups = groupHandlers(handlers);

    expect(groups.has("other")).toBe(true);
    expect(groups.get("other")?.length).toBe(1);
  });
});
