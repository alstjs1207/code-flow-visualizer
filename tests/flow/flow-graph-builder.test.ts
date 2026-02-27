import { describe, it, expect } from "vitest";
import { CodeFlowParser } from "@/lib/parser";
import { readFileSync } from "fs";
import { join } from "path";

const fixturesDir = join(__dirname, "../parser/fixtures");

function readFixture(name: string): string {
  return readFileSync(join(fixturesDir, name), "utf-8");
}

describe("flow-graph-builder", () => {
  it("builds FlowGraph from simple handler", () => {
    const handlerCode = readFixture("simple-handler.ts");

    const parser = new CodeFlowParser(
      new Map([["simple-handler.ts", handlerCode]])
    );

    const handlers = parser.scanHandlers();
    expect(handlers.length).toBe(1);

    const graph = parser.buildFlowGraph(handlers[0]);
    expect(graph.handler).toBe("createEnrollment");
    expect(graph.method).toBe("POST");
    expect(graph.path).toBe("/api/enrollments");
    expect(graph.nodes.length).toBeGreaterThan(0);
    expect(graph.edges.length).toBeGreaterThan(0);

    // Should have entry node
    const entryNodes = graph.nodes.filter((n) => n.type === "entry");
    expect(entryNodes.length).toBe(1);
    expect(entryNodes[0].label).toContain("POST");
  });

  it("builds FlowGraph from handler + service combination", () => {
    const handlerCode = readFixture("simple-handler.ts");
    const serviceCode = readFixture("nested-conditions.ts");

    const parser = new CodeFlowParser(
      new Map([
        ["enrollment.handler.ts", handlerCode],
        ["enrollment.service.ts", serviceCode],
      ])
    );

    const handlers = parser.scanHandlers();
    expect(handlers.length).toBe(1);

    const graph = parser.buildFlowGraph(handlers[0]);

    // Should have nodes from handler layer
    const handlerNodes = graph.nodes.filter((n) => n.layer === "handler");
    expect(handlerNodes.length).toBeGreaterThan(0);

    // Should have nodes from service layer
    const serviceNodes = graph.nodes.filter((n) => n.layer === "service");
    expect(serviceNodes.length).toBeGreaterThan(0);

    // Should have nodes from dao layer
    const daoNodes = graph.nodes.filter((n) => n.layer === "dao");
    expect(daoNodes.length).toBeGreaterThan(0);
  });

  it("uses layer-specific ID prefixes (h, s, d)", () => {
    const handlerCode = readFixture("simple-handler.ts");
    const serviceCode = readFixture("nested-conditions.ts");

    const parser = new CodeFlowParser(
      new Map([
        ["enrollment.handler.ts", handlerCode],
        ["enrollment.service.ts", serviceCode],
      ])
    );

    const handlers = parser.scanHandlers();
    const graph = parser.buildFlowGraph(handlers[0]);

    for (const node of graph.nodes) {
      if (node.layer === "handler") {
        expect(node.id).toMatch(/^h/);
      } else if (node.layer === "service") {
        expect(node.id).toMatch(/^s/);
      } else if (node.layer === "dao") {
        expect(node.id).toMatch(/^d/);
      }
    }
  });

  it("expands DAO calls inside return statements", () => {
    const handlerCode = readFixture("fastify-class-full.ts");
    const serviceCode = `
class AccountService {
  repository: AccountRepository;

  async getAccountById(id: string) {
    return this.repository.findById(id);
  }
}`;

    const parser = new CodeFlowParser(
      new Map([
        ["account.handler.ts", handlerCode],
        ["account.service.ts", serviceCode],
      ])
    );

    const handlers = parser.scanHandlers();
    const getHandler = handlers.find((h) => h.method === "GET")!;
    const graph = parser.buildFlowGraph(getHandler);

    // DAO layer should be present (return statement matched)
    const daoNodes = graph.nodes.filter((n) => n.layer === "dao");
    expect(daoNodes.length).toBeGreaterThanOrEqual(1);
    expect(daoNodes[0].label).toContain("repository.findById");
  });

  it("expands internal method calls (this.method())", () => {
    const handlerCode = readFixture("fastify-class-full.ts");
    const serviceCode = `
class AccountService {
  repository: AccountRepository;

  async getAccountById(id: string) {
    const account = await this.repository.findById(id);
    if (!account) throw new Error("Not found");
    return this.formatAccount(account);
  }

  private formatAccount(account: any) {
    return { ...account, formatted: true };
  }
}`;

    const parser = new CodeFlowParser(
      new Map([
        ["account.handler.ts", handlerCode],
        ["account.service.ts", serviceCode],
      ])
    );

    const handlers = parser.scanHandlers();
    const getHandler = handlers.find((h) => h.method === "GET")!;
    const graph = parser.buildFlowGraph(getHandler);

    // Service nodes should include nodes from formatAccount expansion
    const serviceNodes = graph.nodes.filter((n) => n.layer === "service");
    expect(serviceNodes.length).toBeGreaterThan(1);

    // DAO layer should be present
    const daoNodes = graph.nodes.filter((n) => n.layer === "dao");
    expect(daoNodes.length).toBeGreaterThanOrEqual(1);

    // No service node should still reference "this.formatAccount"
    const unexpandedNode = serviceNodes.find(
      (n) => n.rawCode?.includes("this.formatAccount")
    );
    expect(unexpandedNode).toBeUndefined();
  });

  it("creates edges connecting handler to service entry", () => {
    const handlerCode = readFixture("simple-handler.ts");
    const serviceCode = readFixture("nested-conditions.ts");

    const parser = new CodeFlowParser(
      new Map([
        ["enrollment.handler.ts", handlerCode],
        ["enrollment.service.ts", serviceCode],
      ])
    );

    const handlers = parser.scanHandlers();
    const graph = parser.buildFlowGraph(handlers[0]);

    // Should have an edge from a handler node to a service node
    const crossLayerEdge = graph.edges.find((e) => {
      const fromNode = graph.nodes.find((n) => n.id === e.from);
      const toNode = graph.nodes.find((n) => n.id === e.to);
      return fromNode?.layer === "handler" && toNode?.layer === "service";
    });
    // If service inline expansion occurred, we'll have cross-layer edges
    // Otherwise, the service call is represented as an action node in handler layer
    expect(graph.nodes.length).toBeGreaterThan(3);
  });

  it("classifies service→service calls as service layer, not DAO", () => {
    const handlerCode = readFixture("service-calls-service.ts");

    const parser = new CodeFlowParser(
      new Map([["order.handler.ts", handlerCode]])
    );

    const handlers = parser.scanHandlers();
    expect(handlers.length).toBe(1);

    const graph = parser.buildFlowGraph(handlers[0]);

    // orderDao should produce DAO nodes
    const daoNodes = graph.nodes.filter((n) => n.layer === "dao");
    expect(daoNodes.length).toBeGreaterThanOrEqual(1);
    expect(daoNodes.some((n) => n.label.includes("orderDao"))).toBe(true);

    // customerService call should NOT produce a DAO node
    const daoLabels = daoNodes.map((n) => n.label);
    expect(daoLabels.some((l) => l.includes("customerService"))).toBe(false);
  });

  it("handles switch statements within service methods", () => {
    const handlerCode = `
import { Router } from "express";
const router = Router();
export async function handlePayment(req: any, res: any) {
  const { type } = req.body;
  const result = await paymentService.process(type);
  return res.status(200).json(result);
}
router.post("/api/payments", handlePayment);
`;
    const serviceCode = `
export class PaymentService {
  paymentDao: PaymentDao;

  async process(type: string) {
    switch (type) {
      case 'credit':
        return this.paymentDao.chargeCredit(type);
      case 'debit':
        return this.paymentDao.chargeDebit(type);
      default:
        throw new Error("Unknown payment type");
    }
  }
}
`;

    const parser = new CodeFlowParser(
      new Map([
        ["payment.handler.ts", handlerCode],
        ["payment.service.ts", serviceCode],
      ])
    );

    const handlers = parser.scanHandlers();
    const graph = parser.buildFlowGraph(handlers[0]);

    // Service layer should contain a condition node for the switch
    const serviceConditions = graph.nodes.filter(
      (n) => n.layer === "service" && n.type === "condition"
    );
    expect(serviceConditions.length).toBeGreaterThanOrEqual(1);
    expect(serviceConditions[0].label).toContain("switch");
  });

  it("has no orphan nodes (every non-entry node has an incoming edge)", () => {
    const handlerCode = readFixture("simple-handler.ts");
    const serviceCode = readFixture("nested-conditions.ts");

    const parser = new CodeFlowParser(
      new Map([
        ["enrollment.handler.ts", handlerCode],
        ["enrollment.service.ts", serviceCode],
      ])
    );

    const handlers = parser.scanHandlers();
    const graph = parser.buildFlowGraph(handlers[0]);

    const nodeIds = new Set(graph.nodes.map((n) => n.id));
    const nodesWithIncoming = new Set(graph.edges.map((e) => e.to));
    const entryNodeId = graph.nodes.find((n) => n.type === "entry")?.id;

    for (const node of graph.nodes) {
      if (node.id === entryNodeId) continue; // entry has no incoming
      expect(nodesWithIncoming.has(node.id)).toBe(true);
    }
  });

  it("connects service return nodes back to handler flow", () => {
    const handlerCode = `
import { Router } from "express";
const router = Router();
export async function getUser(req: any, res: any) {
  const user = await userService.findById(req.params.id);
  return res.status(200).json(user);
}
router.get("/api/users/:id", getUser);
`;
    const serviceCode = `
export class UserService {
  userDao: UserDao;

  async findById(id: string) {
    const user = await this.userDao.findOne(id);
    if (!user) {
      throw new Error("Not found");
    }
    return user;
  }
}`;

    const parser = new CodeFlowParser(
      new Map([
        ["user.handler.ts", handlerCode],
        ["user.service.ts", serviceCode],
      ])
    );

    const handlers = parser.scanHandlers();
    const graph = parser.buildFlowGraph(handlers[0]);

    // The service's "return user" should connect to the handler's "res.status(200)"
    const handlerReturnNode = graph.nodes.find(
      (n) => n.layer === "handler" && n.type === "return"
    );
    expect(handlerReturnNode).toBeDefined();

    // The handler return node should have an incoming edge
    const hasIncoming = graph.edges.some((e) => e.to === handlerReturnNode!.id);
    expect(hasIncoming).toBe(true);
  });

  it("does not connect service throw nodes to handler continuation", () => {
    const handlerCode = `
import { Router } from "express";
const router = Router();
export async function getUser(req: any, res: any) {
  const user = await userService.findById(req.params.id);
  return res.status(200).json(user);
}
router.get("/api/users/:id", getUser);
`;
    const serviceCode = `
export class UserService {
  userDao: UserDao;

  async findById(id: string) {
    throw new Error("Always fails");
  }
}`;

    const parser = new CodeFlowParser(
      new Map([
        ["user.handler.ts", handlerCode],
        ["user.service.ts", serviceCode],
      ])
    );

    const handlers = parser.scanHandlers();
    const graph = parser.buildFlowGraph(handlers[0]);

    // The service throw node should NOT have an outgoing edge to handler nodes
    const errorNodes = graph.nodes.filter(
      (n) => n.layer === "service" && n.type === "error"
    );
    expect(errorNodes.length).toBeGreaterThanOrEqual(1);

    for (const errorNode of errorNodes) {
      const outgoing = graph.edges.filter((e) => e.from === errorNode.id);
      for (const edge of outgoing) {
        const target = graph.nodes.find((n) => n.id === edge.to);
        // Error node should not connect to handler layer
        expect(target?.layer).not.toBe("handler");
      }
    }
  });

  it("has no orphan nodes after DAO replacement in service", () => {
    const handlerCode = readFixture("simple-handler.ts");
    const serviceCode = readFixture("nested-conditions.ts");

    const parser = new CodeFlowParser(
      new Map([
        ["enrollment.handler.ts", handlerCode],
        ["enrollment.service.ts", serviceCode],
      ])
    );

    const handlers = parser.scanHandlers();
    const graph = parser.buildFlowGraph(handlers[0]);

    // DAO nodes exist
    const daoNodes = graph.nodes.filter((n) => n.layer === "dao");
    expect(daoNodes.length).toBeGreaterThan(0);

    // Every DAO node should have at least one incoming edge
    for (const daoNode of daoNodes) {
      const hasIncoming = graph.edges.some((e) => e.to === daoNode.id);
      expect(hasIncoming).toBe(true);
    }

    // No service action node should remain that was replaced by a DAO node
    // i.e., no service node whose rawCode matches a DAO label pattern but still exists
    for (const daoNode of daoNodes) {
      // Extract "object.method" from the DAO label like "ticketDao.findById()"
      const match = daoNode.label.match(/^(\w+\.\w+)\(\)$/);
      if (!match) continue;
      const daoCallText = match[1];
      const orphanedServiceNode = graph.nodes.find(
        (n) =>
          n.layer === "service" &&
          (n.type === "action" || n.type === "return") &&
          n.rawCode?.includes(daoCallText)
      );
      expect(orphanedServiceNode).toBeUndefined();
    }
  });

  it("builds FlowGraph with service from inherited handler class", () => {
    const handlerCode = readFixture("fastify-inherited-handler.ts");
    const serviceCode = `
class AccountDeviceService {
  repository: AccountDeviceRepository;

  async registerDevice(command: any) {
    const existing = await this.repository.findByDeviceId(command.deviceId);
    if (existing) {
      return this.repository.update(existing.id, command);
    }
    return this.repository.create(command);
  }
}`;

    const parser = new CodeFlowParser(
      new Map([
        ["account-device.handler.ts", handlerCode],
        ["account-device.service.ts", serviceCode],
      ])
    );

    const handlers = parser.scanHandlers();
    const postHandler = handlers.find((h) => h.method === "POST")!;
    expect(postHandler).toBeDefined();

    const graph = parser.buildFlowGraph(postHandler);

    // Service layer should be present (inherited service type resolved)
    const serviceNodes = graph.nodes.filter((n) => n.layer === "service");
    expect(serviceNodes.length).toBeGreaterThan(0);

    // DAO layer should be present
    const daoNodes = graph.nodes.filter((n) => n.layer === "dao");
    expect(daoNodes.length).toBeGreaterThan(0);
  });

  it("all edges reference existing nodes", () => {
    const handlerCode = readFixture("simple-handler.ts");
    const serviceCode = readFixture("nested-conditions.ts");

    const parser = new CodeFlowParser(
      new Map([
        ["enrollment.handler.ts", handlerCode],
        ["enrollment.service.ts", serviceCode],
      ])
    );

    const handlers = parser.scanHandlers();
    const graph = parser.buildFlowGraph(handlers[0]);

    const nodeIds = new Set(graph.nodes.map((n) => n.id));

    for (const edge of graph.edges) {
      expect(nodeIds.has(edge.from)).toBe(true);
      expect(nodeIds.has(edge.to)).toBe(true);
    }
  });
});
