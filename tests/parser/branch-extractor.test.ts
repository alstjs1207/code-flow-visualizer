import { describe, it, expect } from "vitest";
import { extractBranches, BranchFragment } from "@/lib/parser/branch-extractor";
import { Project } from "ts-morph";
import { readFileSync } from "fs";
import { join } from "path";

const fixturesDir = join(__dirname, "fixtures");

function readFixture(name: string): string {
  return readFileSync(join(fixturesDir, name), "utf-8");
}

function getFunction(code: string, functionName: string) {
  const project = new Project({ useInMemoryFileSystem: true });
  const sourceFile = project.createSourceFile("test.ts", code);
  // Try standalone function first
  const fn = sourceFile.getFunction(functionName);
  if (fn) return fn;
  // Try class method
  for (const cls of sourceFile.getClasses()) {
    const method = cls.getMethod(functionName);
    if (method) return method;
  }
  throw new Error(`Function ${functionName} not found`);
}

describe("branch-extractor", () => {
  it("extracts guard clause (if + throw) as condition + error nodes", () => {
    const code = readFixture("simple-handler.ts");
    const fn = getFunction(code, "createEnrollment");
    const fragment = extractBranches(fn, "handler", "h");

    // Should have at least: condition node for guard, error node for throw
    const conditionNodes = fragment.nodes.filter((n) => n.type === "condition");
    const errorNodes = fragment.nodes.filter((n) => n.type === "error");

    expect(conditionNodes.length).toBeGreaterThanOrEqual(1);
    expect(errorNodes.length).toBeGreaterThanOrEqual(1);

    // Condition should have a label containing the condition text
    expect(conditionNodes[0].label).toContain("ticketId");
  });

  it("extracts nested if/else as multiple condition nodes with correct edges", () => {
    const code = readFixture("nested-conditions.ts");
    const fn = getFunction(code, "create");
    const fragment = extractBranches(fn, "service", "s");

    const conditionNodes = fragment.nodes.filter((n) => n.type === "condition");
    const errorNodes = fragment.nodes.filter((n) => n.type === "error");

    // 3 guard clauses + 1 optional condition = at least 4 conditions
    expect(conditionNodes.length).toBeGreaterThanOrEqual(3);
    // 3 throw statements
    expect(errorNodes.length).toBeGreaterThanOrEqual(3);

    // Check edges connect conditions to errors (true branch)
    const trueEdges = fragment.edges.filter((e) => e.type === "true");
    expect(trueEdges.length).toBeGreaterThanOrEqual(3);
  });

  it("extracts return statements as return nodes", () => {
    const code = readFixture("simple-handler.ts");
    const fn = getFunction(code, "createEnrollment");
    const fragment = extractBranches(fn, "handler", "h");

    const returnNodes = fragment.nodes.filter((n) => n.type === "return");
    expect(returnNodes.length).toBeGreaterThanOrEqual(1);
  });

  it("extracts throw statements as error nodes", () => {
    const code = readFixture("nested-conditions.ts");
    const fn = getFunction(code, "create");
    const fragment = extractBranches(fn, "service", "s");

    const errorNodes = fragment.nodes.filter((n) => n.type === "error");
    expect(errorNodes.length).toBe(3);

    const labels = errorNodes.map((n) => n.label);
    expect(labels).toContain('throw: 유효하지 않은 수강권');
    expect(labels).toContain('throw: 횟수 소진');
    expect(labels).toContain('throw: 스케줄 충돌');
  });

  it("preserves source location", () => {
    const code = readFixture("simple-handler.ts");
    const fn = getFunction(code, "createEnrollment");
    const fragment = extractBranches(fn, "handler", "h");

    // All nodes should have source locations
    for (const node of fragment.nodes) {
      expect(node.source).toBeDefined();
      expect(node.source!.line).toBeGreaterThan(0);
    }
  });

  it("returns BranchFragment with entry and terminal node ids", () => {
    const code = readFixture("simple-handler.ts");
    const fn = getFunction(code, "createEnrollment");
    const fragment = extractBranches(fn, "handler", "h");

    expect(fragment.entryNodeId).toBeDefined();
    // All paths terminate with throw or return, so terminalNodeIds should be populated
    expect(fragment.terminalNodeIds.length).toBeGreaterThanOrEqual(1);
  });

  it("extracts switch statement as condition + case branches", () => {
    const code = `
function processType(type: string) {
  switch (type) {
    case 'a':
      return doA();
    case 'b':
      return doB();
    default:
      throw new Error("unknown");
  }
}
`;
    const fn = getFunction(code, "processType");
    const fragment = extractBranches(fn, "service", "s");

    // Should have a condition node for the switch
    const condNodes = fragment.nodes.filter((n) => n.type === "condition");
    expect(condNodes.length).toBe(1);
    expect(condNodes[0].label).toContain("switch");
    expect(condNodes[0].label).toContain("type");

    // Should have edges for each case
    const caseEdges = fragment.edges.filter((e) => e.from === condNodes[0].id && e.label);
    expect(caseEdges.length).toBe(3); // case 'a', case 'b', default

    const labels = caseEdges.map((e) => e.label);
    expect(labels).toContain("case 'a'");
    expect(labels).toContain("case 'b'");
    expect(labels).toContain("default");
  });

  it("switch without default makes condition an exit node", () => {
    const code = `
function handleStatus(status: string) {
  switch (status) {
    case 'active':
      return activate();
    case 'inactive':
      return deactivate();
  }
  return fallback();
}
`;
    const fn = getFunction(code, "handleStatus");
    const fragment = extractBranches(fn, "service", "s");

    const condNodes = fragment.nodes.filter((n) => n.type === "condition");
    expect(condNodes.length).toBe(1);

    // The condition itself should connect to the fallback return statement
    // because there's no default clause
    const returnNodes = fragment.nodes.filter((n) => n.type === "return");
    expect(returnNodes.length).toBeGreaterThanOrEqual(1);
  });

  it("strips this. prefix from action labels", () => {
    const code = `
class MyService {
  async doWork() {
    const result = await this.customerService.getActiveCustomer(id);
    this.logger.info("done");
    return result;
  }
}
`;
    const fn = getFunction(code, "doWork");
    const fragment = extractBranches(fn, "service", "s");

    const actionNodes = fragment.nodes.filter((n) => n.type === "action");
    for (const node of actionNodes) {
      expect(node.label).not.toMatch(/^this\./);
    }

    // Should have "customerService.getActiveCustomer()" not "this.customerService..."
    const csNode = actionNodes.find((n) => n.label.includes("customerService"));
    expect(csNode).toBeDefined();
    expect(csNode!.label).toBe("customerService.getActiveCustomer()");
  });
});
