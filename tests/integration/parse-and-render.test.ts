import { describe, it, expect } from "vitest";
import { CodeFlowParser } from "@/lib/parser";
import { applyDagreLayout } from "@/lib/layout/dagre-layout";
import { readFileSync } from "fs";
import { join } from "path";

const fixturesDir = join(__dirname, "../parser/fixtures");

function readFixture(name: string): string {
  return readFileSync(join(fixturesDir, name), "utf-8");
}

describe("parse-and-render integration", () => {
  it("full pipeline: fixture → FlowGraph → layout", () => {
    const handlerCode = readFixture("simple-handler.ts");
    const serviceCode = readFixture("nested-conditions.ts");

    const parser = new CodeFlowParser(
      new Map([
        ["enrollment.handler.ts", handlerCode],
        ["enrollment.service.ts", serviceCode],
      ])
    );

    // Step 1: Scan handlers
    const handlers = parser.scanHandlers();
    expect(handlers.length).toBe(1);
    expect(handlers[0].method).toBe("POST");
    expect(handlers[0].path).toBe("/api/enrollments");

    // Step 2: Build FlowGraph
    const graph = parser.buildFlowGraph(handlers[0]);
    expect(graph.handler).toBe("createEnrollment");
    expect(graph.nodes.length).toBeGreaterThan(10);
    expect(graph.edges.length).toBeGreaterThan(10);

    // Verify node types
    const nodeTypes = new Set(graph.nodes.map((n) => n.type));
    expect(nodeTypes.has("entry")).toBe(true);
    expect(nodeTypes.has("condition")).toBe(true);
    expect(nodeTypes.has("error")).toBe(true);

    // Verify layers
    const layers = new Set(graph.nodes.map((n) => n.layer));
    expect(layers.has("handler")).toBe(true);
    expect(layers.has("service")).toBe(true);
    expect(layers.has("dao")).toBe(true);

    // Verify edge types
    const trueEdges = graph.edges.filter((e) => e.type === "true");
    const falseEdges = graph.edges.filter((e) => e.type === "false");
    expect(trueEdges.length).toBeGreaterThanOrEqual(3);
    expect(falseEdges.length).toBeGreaterThanOrEqual(3);

    // Step 3: Apply layout
    const { nodes, edges } = applyDagreLayout(graph);
    expect(nodes.length).toBe(graph.nodes.length);
    expect(edges.length).toBe(graph.edges.length);

    // All nodes should have positions
    for (const node of nodes) {
      expect(node.position.x).toBeDefined();
      expect(node.position.y).toBeDefined();
      expect(typeof node.position.x).toBe("number");
      expect(typeof node.position.y).toBe("number");
    }
  });

  it("handles handler-only code (no service)", () => {
    const handlerCode = readFixture("express-routes.ts");

    const parser = new CodeFlowParser(
      new Map([["routes.ts", handlerCode]])
    );

    const handlers = parser.scanHandlers();
    expect(handlers.length).toBe(4);

    for (const handler of handlers) {
      const graph = parser.buildFlowGraph(handler);
      expect(graph.nodes.length).toBeGreaterThan(0);

      const { nodes } = applyDagreLayout(graph);
      expect(nodes.length).toBe(graph.nodes.length);
    }
  });

  it("full pipeline: Fastify route handler → FlowGraph → layout", () => {
    const handlerCode = readFixture("fastify-class-handler.ts");

    const parser = new CodeFlowParser(
      new Map([["fastify-handler.ts", handlerCode]])
    );

    // Step 1: Scan handlers — Fastify detection
    const handlers = parser.scanHandlers();
    expect(handlers.length).toBe(4);

    const methods = handlers.map((h) => h.method);
    expect(methods).toContain("GET");
    expect(methods).toContain("POST");
    expect(methods).toContain("PUT");
    expect(methods).toContain("DELETE");

    // Step 2: Build FlowGraph for GET handler
    const getHandler = handlers.find((h) => h.method === "GET")!;
    const graph = parser.buildFlowGraph(getHandler);
    expect(graph.nodes.length).toBeGreaterThan(0);

    // Verify handler layer exists
    const layers = new Set(graph.nodes.map((n) => n.layer));
    expect(layers.has("handler")).toBe(true);

    // Step 3: Apply layout
    const { nodes, edges } = applyDagreLayout(graph);
    expect(nodes.length).toBe(graph.nodes.length);

    for (const node of nodes) {
      expect(typeof node.position.x).toBe("number");
      expect(typeof node.position.y).toBe("number");
    }
  });

  it("Fastify class with service type resolution → deep tracing", () => {
    const handlerCode = readFixture("fastify-class-full.ts");
    const serviceCode = `
class AccountService {
  repository: AccountRepository;

  async getAccountById(id: string) {
    return this.repository.findById(id);
  }

  async createAccount(command: any) {
    return this.repository.save(command);
  }
}
`;

    const parser = new CodeFlowParser(
      new Map([
        ["account.handler.ts", handlerCode],
        ["account.service.ts", serviceCode],
      ])
    );

    // Step 1: Scan handlers
    const handlers = parser.scanHandlers();
    expect(handlers.length).toBe(3);

    const getHandler = handlers.find((h) => h.method === "GET")!;
    expect(getHandler.path).toBe("/account");
    expect(getHandler.serviceTypeMap?.service).toBe("accountService");

    // Step 2: Build FlowGraph — should resolve service → accountService
    const graph = parser.buildFlowGraph(getHandler);
    expect(graph.nodes.length).toBeGreaterThan(1);

    // Verify DAO layer nodes exist (deep tracing + return-DAO matching succeeded)
    // Note: when a service method is a simple DAO call wrapper (return this.repo.find()),
    // all service nodes get replaced by DAO nodes, so service layer may be absent
    const layers = new Set(graph.nodes.map((n) => n.layer));
    expect(layers.has("dao")).toBe(true);
    const daoNodes = graph.nodes.filter((n) => n.layer === "dao");
    expect(daoNodes.length).toBeGreaterThanOrEqual(1);
    expect(daoNodes[0].label).toContain("repository.findById");

    // Step 3: Layout
    const { nodes } = applyDagreLayout(graph);
    expect(nodes.length).toBe(graph.nodes.length);
  });

  it("skillflo pattern: bindRoute + service→service + switch", () => {
    const handlerCode = readFixture("skillflo-handler.ts");
    const serviceCode = `
class MemberService {
  memberDao: MemberDao;
  auditService: AuditService;

  async getMemberById(id: number) {
    const member = await this.memberDao.findById(id);
    if (!member) {
      throw new Error("Member not found");
    }
    switch (member.status) {
      case 'active':
        return member;
      case 'suspended':
        throw new Error("Member suspended");
      default:
        throw new Error("Unknown status");
    }
  }

  async createMember(data: any) {
    const result = await this.memberDao.save(data);
    await this.auditService.log("member_created", result.id);
    return result;
  }
}
`;

    const parser = new CodeFlowParser(
      new Map([
        ["member.handler.ts", handlerCode],
        ["member.service.ts", serviceCode],
      ])
    );

    // Step 1: Scan — bindRoute routePath resolved
    const handlers = parser.scanHandlers();
    expect(handlers.length).toBeGreaterThanOrEqual(2);

    const getHandler = handlers.find((h) => h.method === "GET")!;
    expect(getHandler.path).toBe("/member/:id");

    // Step 2: Build FlowGraph for GET — switch + DAO
    const graph = parser.buildFlowGraph(getHandler);
    const layers = new Set(graph.nodes.map((n) => n.layer));
    expect(layers.has("handler")).toBe(true);
    expect(layers.has("service")).toBe(true);
    expect(layers.has("dao")).toBe(true);

    // Should have switch condition node
    const switchNodes = graph.nodes.filter(
      (n) => n.type === "condition" && n.label.includes("switch")
    );
    expect(switchNodes.length).toBeGreaterThanOrEqual(1);

    // Step 3: Build FlowGraph for POST — service→service (auditService) should not be DAO
    const postHandler = handlers.find((h) => h.method === "POST")!;
    const postGraph = parser.buildFlowGraph(postHandler);
    const postDaoNodes = postGraph.nodes.filter((n) => n.layer === "dao");
    const postDaoLabels = postDaoNodes.map((n) => n.label);
    // auditService should NOT appear as DAO
    expect(postDaoLabels.some((l) => l.includes("auditService"))).toBe(false);
    // memberDao should appear as DAO
    expect(postDaoLabels.some((l) => l.includes("memberDao"))).toBe(true);

    // Step 4: Layout
    const { nodes } = applyDagreLayout(graph);
    expect(nodes.length).toBe(graph.nodes.length);
    for (const node of nodes) {
      expect(typeof node.position.x).toBe("number");
      expect(typeof node.position.y).toBe("number");
    }
  });

  it("full pipeline: standalone handler + service → FlowGraph → layout", () => {
    const handlerCode = readFixture("standalone-handler.ts");
    const serviceCode = readFixture("nested-conditions.ts");

    const parser = new CodeFlowParser(
      new Map([
        ["enrollment.handler.ts", handlerCode],
        ["enrollment.service.ts", serviceCode],
      ])
    );

    // Step 1: Scan handlers — standalone detection (no Express routes)
    const handlers = parser.scanHandlers();
    expect(handlers.length).toBe(1);
    expect(handlers[0].method).toBe("POST");
    expect(handlers[0].path).toBe("/");
    expect(handlers[0].functionName).toBe("createEnrollment");
    expect(handlers[0].serviceRefs).toContain("enrollmentService.create");

    // Step 2: Build FlowGraph
    const graph = parser.buildFlowGraph(handlers[0]);
    expect(graph.handler).toBe("createEnrollment");
    expect(graph.nodes.length).toBeGreaterThan(0);
    expect(graph.edges.length).toBeGreaterThan(0);

    // Verify handler layer exists
    const layers = new Set(graph.nodes.map((n) => n.layer));
    expect(layers.has("handler")).toBe(true);

    // Step 3: Apply layout
    const { nodes, edges } = applyDagreLayout(graph);
    expect(nodes.length).toBe(graph.nodes.length);
    expect(edges.length).toBe(graph.edges.length);

    for (const node of nodes) {
      expect(typeof node.position.x).toBe("number");
      expect(typeof node.position.y).toBe("number");
    }
  });
});
